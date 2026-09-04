import { prisma } from "./prisma";

/**
 * CRUCE del catálogo en BD con la tienda Shopify de Northdeco, por SKU.
 *
 * `publicarPiezas()` da de alta a propósito solo con lo que sabe Drive: la
 * pieza nace sin foto, sin URL y sin material. Este módulo completa esas
 * fichas contra northdeco.com (products.json público) y las escribe en
 * NorthdecoPieza. Lo dispara en segundo plano la galería (leerGaleria) cuando
 * ve piezas incompletas, con candado y cooldown: así una familia marcada 🟨
 * aparece y se completa sola, sin tocar el ERP.
 *
 * La lógica de emparejamiento (SKU laxo, erratas con distancia ≤2 dentro de la
 * familia, cascada de imagen por variante EXACTA) viene contrastada de
 * scripts/sync-fotos-shopify.ts — que sigue existiendo para el manifest viejo.
 * Regla de oro heredada: mejor "Sin foto" que la foto de OTRO color.
 */

type Variant = {
  id: number;
  title: string;
  sku?: string | null;
  featured_image?: { src?: string } | null;
};
type Product = {
  handle: string;
  title: string;
  product_type?: string;
  tags?: string[] | string;
  body_html?: string;
  variants: Variant[];
  images?: { src: string; variant_ids?: number[] }[];
};

const loose = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

const COLOR_TOKENS: Record<string, string[]> = {
  NEGRO: ["negro", "black"],
  BLANCO: ["blanco", "white", "off white", "offwhite"],
  GRIS: ["gris", "grey", "gray", "grafito", "musgo", "mossgrey", "blackgrey", "darkgrey"],
  VERDE: ["verde", "green", "oliva", "olive", "army", "grassgreen"],
  AZUL: ["azul", "blue", "turquesa", "agua", "navy", "petroleo"],
  ROJO: ["rojo", "red", "teja", "burdeos", "granate"],
  NARANJA: ["naranja", "orange", "darkorange"],
  AMARILLO: ["amarillo", "yellow", "mostaza", "mustard", "ginger", "ocre"],
  ROSA: ["rosa", "pink", "nude", "tuscany", "salmon"],
  BEIGE: ["beige", "crema", "cream", "arena", "sand", "capuccino", "cappuccino", "topo", "taupe"],
  MARRON: ["marron", "brown", "caoba", "cognac", "chocolate", "camel"],
  NOGAL: ["nogal", "walnut"],
  NATURAL: ["natural", "maple", "roble", "oak", "haya", "arce"],
  VINTAGE: ["vintage"],
  CROMADO: ["cromado", "polished", "cromo", "chrome"],
};

const sinAcentos = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function colorsOf(text: string): Set<string> {
  const t = sinAcentos(text);
  const out = new Set<string>();
  for (const [token, words] of Object.entries(COLOR_TOKENS)) {
    if (words.some((w) => t.includes(w))) out.add(token);
  }
  return out;
}

const sameColor = (a: string, b: string) => {
  const A = colorsOf(a), B = colorsOf(b);
  if (!A.size || !B.size) return false;
  for (const x of A) if (B.has(x)) return true;
  return false;
};

function imageFor(p: Product, v: Variant): string | null {
  if (v.featured_image?.src) return v.featured_image.src;
  const byIds = p.images?.find((im) => (im.variant_ids ?? []).includes(v.id));
  if (byIds) return byIds.src;
  const otros = p.variants.filter((x) => x.id !== v.id);
  const cand = (p.images ?? []).filter((im) => {
    const fn = im.src.split("/").pop() ?? "";
    if (!sameColor(fn, v.title + " " + (v.sku ?? ""))) return false;
    return !otros.some((o) => sameColor(fn, o.title + " " + (o.sku ?? "")));
  });
  return cand.length ? cand[0].src : null;
}

/* Material dominante — mismas reglas que scripts/enrich-materials.ts:
   revestimiento (piel > tela) manda; entre estructuras gana la fuente más
   fiable (handle > tipo > tags > descripción) y, en empate, la superficie
   sobre las patas. */
const RULES: Array<[string, RegExp]> = [
  ["madera", /\b(madera|roble|nogal|pino|teca|fresno|mango|acacia|bambu|olmo|abeto|haya|contrachapado|mdf)\b/],
  ["metal", /\b(metal|metalica?s?|acero|hierro|aluminio|laton|cromado)\b/],
  ["plastico", /\b(plastico|polipropileno|policarbonato|resina|abs|pvc)\b/],
  ["piel", /\b(piel|cuero|polipiel)\b/],
  ["cristal", /\b(cristal|vidrio)\b/],
  ["tela", /\b(tela|tejido|tapizad[oa]s?|terciopelo|lino|algodon|boucle|chenilla|poliester)\b/],
  ["marmol", /\b(marmol|travertino|piedra|microcemento|cemento|hormigon)\b/],
  ["ratan", /\b(ratan|mimbre|rafia|yute|cuerda|fibra natural)\b/],
  ["ceramica", /\b(ceramica|gres)\b/],
];
const REVESTIMIENTOS = ["piel", "tela"];
const ORDEN_ESTRUCTURA = ["marmol", "cristal", "ceramica", "ratan", "plastico", "madera", "metal"];

function detectIn(text: string): string[] {
  const t = sinAcentos(text);
  return RULES.filter(([, re]) => re.test(t)).map(([mat]) => mat);
}

function pickMaterial(sources: string[]): { material: string | null; all: string[] } {
  const bestRank = new Map<string, number>();
  sources.forEach((src, rank) => {
    for (const mat of detectIn(src)) if (!bestRank.has(mat)) bestRank.set(mat, rank);
  });
  const all = [...bestRank.keys()];
  if (!all.length) return { material: null, all };
  for (const rev of REVESTIMIENTOS) if (bestRank.has(rev)) return { material: rev, all };
  const estructura = all
    .filter((m) => !REVESTIMIENTOS.includes(m))
    .sort((a, b) => {
      const byRank = bestRank.get(a)! - bestRank.get(b)!;
      if (byRank !== 0) return byRank;
      return ORDEN_ESTRUCTURA.indexOf(a) - ORDEN_ESTRUCTURA.indexOf(b);
    });
  return { material: estructura[0] ?? null, all };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function catalogoShopify(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= 20; page++) {
    let data: { products?: Product[] } | null = null;
    for (let intento = 0; intento < 3 && !data; intento++) {
      if (intento > 0) await sleep(1500 * intento);
      try {
        const r = await fetch(`https://northdeco.com/products.json?limit=250&page=${page}`);
        if (r.ok) data = (await r.json()) as { products: Product[] };
      } catch {
        /* reintentar */
      }
    }
    if (!data?.products?.length) break; // única condición de parada válida
    all.push(...data.products);
  }
  return all;
}

// Un solo cruce a la vez y como mucho uno cada 5 min: descarga el catálogo
// entero de la tienda y esto lo dispara el render de la página pública.
const INTENTO_CADA_MS = 5 * 60_000;
let enCurso = false;
let ultimoIntento = 0;

/**
 * Completa EN SEGUNDO PLANO las piezas del catálogo en BD que están sin foto,
 * sin URL o sin material, cruzando por SKU contra la tienda. No lanza nunca:
 * los fallos quedan en el log y se reintenta pasado el cooldown.
 */
export function completarDesdeShopify(): void {
  if (enCurso || Date.now() - ultimoIntento < INTENTO_CADA_MS) return;
  enCurso = true;
  ultimoIntento = Date.now();

  void (async () => {
    try {
      const cat = await import("./northdeco-catalogo");
      const { origen } = await cat.leerCatalogoConOrigen();
      if (origen !== "bd") return; // en modo manifest no hay filas que actualizar

      const piezas = await cat.leerCatalogoCompleto();
      const pendientes = piezas.filter(
        (p) => p.sku && (!p.img || !p.url || !p.material),
      );
      if (!pendientes.length) return;

      const products = await catalogoShopify();
      if (!products.length) return;
      const bySku = new Map<string, { p: Product; v: Variant }>();
      for (const p of products) {
        for (const v of p.variants) {
          if (!v.sku) continue;
          const k = loose(v.sku);
          if (!bySku.has(k)) bySku.set(k, { p, v });
        }
      }
      const keys = [...bySku.keys()];

      // Productos de cada familia (por prefijo de SKU laxo), para el 2º escalón.
      const productosDeFam = (famKey: string): Product[] => {
        const out = new Set<Product>();
        for (const [k, hit] of bySku) if (k.startsWith(famKey)) out.add(hit.p);
        return [...out];
      };

      let completadas = 0;
      const sinMatch: string[] = [];
      for (const pieza of pendientes) {
        const k = loose(pieza.sku!);
        const famKey = loose(pieza.fam);
        let hit = bySku.get(k);
        if (!hit) {
          // errata: el más parecido dentro de la misma familia
          const cand = keys
            .filter((x) => x.startsWith(famKey))
            .map((x) => ({ x, d: editDistance(k, x) }))
            .sort((a, b) => a.d - b.d)[0];
          if (cand && cand.d <= 2) hit = bySku.get(cand.x);
        }

        let img: string | null = null;
        let url: string | null = null;
        let variant: string | null = null;
        let producto: Product | null = null;

        if (hit) {
          producto = hit.p;
          img = imageFor(hit.p, hit.v);
          url = `https://northdeco.com/products/${hit.p.handle}?variant=${hit.v.id}`;
          variant = hit.v.title !== "Default Title" ? hit.v.title : null;
        } else {
          // 2º escalón: el SKU no es una variante de la tienda (p. ej. "ND-0112"
          // a secas, o sufijos tipo "CHEVAL MESA1"). Si la familia tiene UN solo
          // producto, se usa su ficha; la foto principal SOLO si el SKU no
          // nombra ningún color (la regla de oro: jamás la foto de otro color).
          const candidatos = productosDeFam(famKey);
          if (candidatos.length === 1) {
            producto = candidatos[0];
            url = `https://northdeco.com/products/${producto.handle}`;
            const colorPieza = colorsOf(`${pieza.sku} ${pieza.variant ?? ""}`);
            if (!colorPieza.size) {
              img = producto.images?.[0]?.src ?? null;
            } else {
              // Con color conocido, solo una variante de ese color sirve.
              const v = producto.variants.find((x) =>
                sameColor(`${x.title} ${x.sku ?? ""}`, `${pieza.sku} ${pieza.variant ?? ""}`),
              );
              if (v) {
                img = imageFor(producto, v);
                url = `https://northdeco.com/products/${producto.handle}?variant=${v.id}`;
                variant = v.title !== "Default Title" ? v.title : null;
              }
            }
          }
        }

        if (!producto) {
          sinMatch.push(pieza.sku!);
          continue;
        }

        const tags = Array.isArray(producto.tags) ? producto.tags.join(" ") : (producto.tags ?? "");
        const desc = (producto.body_html ?? "").replace(/<[^>]+>/g, " ");
        const mat = pickMaterial([producto.handle, producto.product_type ?? "", tags, desc]);

        await prisma.northdecoPieza.update({
          where: { file: pieza.file },
          data: {
            img: img ?? pieza.img,
            url: url ?? pieza.url,
            variant: variant ?? pieza.variant,
            // El alta pone el SKU de nombre provisional: cámbialo por el título
            // real del producto. Un nombre puesto a mano no se toca.
            ...(pieza.name === pieza.sku ? { name: producto.title } : {}),
            ...(pieza.material ? {} : { material: mat.material, materials: mat.all }),
          },
        });
        completadas++;
      }

      cat.invalidarCatalogo();
      console.log(
        `[northdeco-shopify] cruce por SKU: ${completadas} completadas de ${pendientes.length} pendientes` +
          (sinMatch.length ? ` · sin match en la tienda: ${sinMatch.join(", ")}` : ""),
      );
    } catch (err) {
      console.error("[northdeco-shopify] cruce fallido:", err);
    } finally {
      enCurso = false;
    }
  })();
}
