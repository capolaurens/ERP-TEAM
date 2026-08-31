/**
 * Sincroniza FOTO + URL + nombre de variante de cada pieza de /northdeco con
 * Shopify, emparejando por el SKU COMPLETO de la variante.
 *
 * Uso:  npx tsx scripts/sync-fotos-shopify.ts [--dry]
 *
 * Por qué existe: la foto de la tarjeta debe ser la del COLOR EXACTO del 3D.
 * Antes se heredaba la imagen principal del producto (siempre la misma para
 * todas las variantes), lo que enseñaba una silla blanca junto a un 3D verde.
 *
 * Cascada de imagen para una variante:
 *   1. variant.featured_image.src  (la que Shopify asocia a esa variante)
 *   2. imagen del producto cuyo `variant_ids` incluya esa variante
 *   3. nada: se deja `img` en null (mejor "Sin foto" que una foto equivocada)
 *
 * GOTCHA de paginación: products.json puede devolver MENOS de `limit` en una
 * página y aún así tener más páginas. Hay que parar solo con página vacía.
 */
import fs from "node:fs";
import path from "node:path";

const MANIFEST = path.join(process.cwd(), "public", "northdeco", "manifest.json");
const DRY = process.argv.includes("--dry");

type Variant = {
  id: number;
  title: string;
  sku?: string | null;
  featured_image?: { src?: string } | null;
};
type Product = {
  handle: string;
  title: string;
  variants: Variant[];
  images?: { src: string; variant_ids?: number[] }[];
};
type Item = {
  file: string;
  fam: string;
  name: string;
  sku?: string | null;
  img?: string | null;
  url?: string | null;
  variant?: string | null;
  [k: string]: unknown;
};

/** Clave laxa: solo alfanuméricos en mayúsculas (ND-0608-GRASSGREN#45 → ND0608GRASSGREN45). */
const loose = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Distancia de edición acotada, para erratas del tipo GRASSGREN/GRASSGREEN. */
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

/** Familias de color: varios sinónimos → un token canónico. */
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
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Tokens de color presentes en un texto (título de variante, sku, nombre de fichero). */
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

async function catalog(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetch(`https://northdeco.com/products.json?limit=250&page=${page}`);
    if (!r.ok) break;
    const data = (await r.json()) as { products: Product[] };
    if (!data.products?.length) break; // ← única condición de parada válida
    all.push(...data.products);
  }
  return all;
}

function imageFor(p: Product, v: Variant): string | null {
  if (v.featured_image?.src) return v.featured_image.src;
  const byIds = p.images?.find((im) => (im.variant_ids ?? []).includes(v.id));
  if (byIds) return byIds.src;
  // Último recurso: imagen cuyo NOMBRE DE FICHERO nombre este color y ningún
  // otro color de la misma familia (si no, sería ambiguo).
  const otros = p.variants.filter((x) => x.id !== v.id);
  const cand = (p.images ?? []).filter((im) => {
    const fn = im.src.split("/").pop() ?? "";
    if (!sameColor(fn, v.title + " " + (v.sku ?? ""))) return false;
    return !otros.some((o) => sameColor(fn, o.title + " " + (o.sku ?? "")));
  });
  return cand.length ? cand[0].src : null;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Item[];
  const products = await catalog();
  console.log(`Catálogo Shopify: ${products.length} productos`);

  // índice sku → {producto, variante}
  const bySku = new Map<string, { p: Product; v: Variant }>();
  for (const p of products) {
    for (const v of p.variants) {
      if (!v.sku) continue;
      const k = loose(v.sku);
      if (!bySku.has(k)) bySku.set(k, { p, v });
    }
  }
  const keys = [...bySku.keys()];

  let fotoCambiada = 0, variantCambiada = 0, urlCambiada = 0;
  const sinMatch: string[] = [];
  const sinFoto: string[] = [];

  for (const e of manifest) {
    if (!e.sku) continue;
    const k = loose(e.sku);
    let hit = bySku.get(k);
    if (!hit) {
      // errata: buscar el más parecido dentro de la misma familia
      const famKey = loose(e.fam);
      const cand = keys
        .filter((x) => x.startsWith(famKey))
        .map((x) => ({ x, d: editDistance(k, x) }))
        .sort((a, b) => a.d - b.d)[0];
      if (cand && cand.d <= 2) {
        hit = bySku.get(cand.x);
        console.log(`  ~ ${e.sku} ≈ ${hit!.v.sku} (distancia ${cand.d})`);
      }
    }
    if (!hit) {
      // La variante no existe (aún) en la tienda: la foto que hubiera heredado
      // sería de otro color, así que se retira.
      sinMatch.push(`${e.sku} · ${e.name}`);
      e.img = null;
      continue;
    }

    const img = imageFor(hit.p, hit.v);
    const url = `https://northdeco.com/products/${hit.p.handle}?variant=${hit.v.id}`;
    const variant = hit.v.title !== "Default Title" ? hit.v.title : null;

    if (img && e.img !== img) {
      e.img = img;
      fotoCambiada++;
    }
    if (!img) {
      e.img = null;
      sinFoto.push(`${e.sku} · ${e.name}`);
    }
    if (e.url !== url) {
      e.url = url;
      urlCambiada++;
    }
    if (variant && e.variant !== variant) {
      e.variant = variant;
      variantCambiada++;
    }
  }

  // ---- 2ª pasada: fichas SIN sku. Se empareja por color solo si el resultado
  // es ÚNICO dentro de la familia y esa variante no la usa ya otra ficha.
  const usados = new Set(
    manifest.map((e) => (e.sku ? loose(e.sku) : "")).filter(Boolean),
  );
  let porColor = 0;
  const anulados: string[] = [];
  for (const e of manifest) {
    if (e.sku) continue;
    const famKey = loose(e.fam);
    const cands = [...bySku.entries()]
      .filter(([k]) => k.startsWith(famKey) && !usados.has(k))
      .map(([, hit]) => hit);
    const color = `${e.variant ?? ""}`;

    // 2a. Si la foto ACTUAL ya nombra a una variante concreta (el fichero de
    // Shopify suele llevar el sku o el color), adoptamos esa variante en vez
    // de descartar una foto que ya era correcta.
    const fn = (e.img ?? "").split("/").pop() ?? "";
    // Guardián: si en el QA identificamos un color, la variante candidata no
    // puede contradecirlo (la foto heredada puede ser de otro color).
    const chip = colorsOf(color);
    const noContradice = (c: { v: Variant }) => {
      if (!chip.size) return true;
      const vc = colorsOf(`${c.v.title} ${c.v.sku ?? ""}`);
      if (!vc.size) return true;
      for (const x of chip) if (vc.has(x)) return true;
      return false;
    };
    let match = fn
      ? cands.filter((c) => c.v.sku && loose(fn).includes(loose(c.v.sku))).filter(noContradice)
      : [];
    if (match.length !== 1 && fn) {
      const porColorFoto = cands
        .filter((c) => sameColor(fn, `${c.v.title} ${c.v.sku ?? ""}`))
        .filter(noContradice);
      if (porColorFoto.length === 1) match = porColorFoto;
    }
    // 2b. Si no, por el color del chip que asignamos en el QA.
    if (match.length !== 1 && color) {
      match = cands.filter((c) => sameColor(color, `${c.v.title} ${c.v.sku ?? ""}`));
    }
    // 2c. Familia con UNA sola variante en Shopify: no hay ambigüedad posible
    // (siempre que no contradiga el color identificado en el QA).
    if (match.length !== 1) {
      const todasFam = [...bySku.entries()].filter(([k]) => k.startsWith(famKey));
      const fichasFam = manifest.filter((x) => x.fam === e.fam).length;
      if (todasFam.length === 1 && fichasFam === 1) {
        const unica = todasFam[0][1];
        if (noContradice(unica)) match = [unica];
      }
    }
    if (match.length === 1) {
      const { p, v } = match[0];
      const img = imageFor(p, v);
      e.sku = (v.sku ?? "").toUpperCase();
      e.variant = v.title !== "Default Title" ? v.title : e.variant;
      e.url = `https://northdeco.com/products/${p.handle}?variant=${v.id}`;
      e.img = img;
      usados.add(loose(e.sku));
      porColor++;
      console.log(`  + ${e.fam} ${e.name} [${color}] → ${e.sku}`);
    } else if (e.img) {
      // No se puede garantizar el color: mejor sin foto que con la equivocada.
      e.img = null;
      anulados.push(`${e.fam} · ${e.name} [${color || "?"}]`);
    }
  }

  if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify(manifest) + "\n");
  console.log(`\nFichas sin sku emparejadas por color: ${porColor}`);
  console.log(`Fotos retiradas por no poder garantizar el color: ${anulados.length}`);
  for (const a of anulados) console.log("   ·", a);

  console.log(`\nFotos corregidas: ${fotoCambiada} · urls: ${urlCambiada} · nombres de variante: ${variantCambiada}`);
  console.log(`SKU sin producto en Shopify: ${sinMatch.length}`);
  for (const s of sinMatch) console.log("   ·", s);
  console.log(`Variantes sin imagen propia: ${sinFoto.length}`);
  for (const s of sinFoto) console.log("   ·", s);
  if (DRY) console.log("\n(dry-run: no se ha escrito el manifest)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
