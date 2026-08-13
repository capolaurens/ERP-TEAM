/**
 * Enriquecer el manifest de /northdeco con el MATERIAL de cada mueble.
 *
 * Uso:  npx tsx scripts/enrich-materials.ts
 *
 * Para cada modelo con `url`, consulta el JSON público de Shopify
 * (`northdeco.com/products/<handle>.js`) y deduce UN material dominante por
 * mueble (campo `material` del manifest), para que cada pieza aparezca en un
 * solo filtro. Reglas:
 *   1. El revestimiento manda: si lleva piel → "piel"; si no, si lleva tela →
 *      "tela" (una silla de madera tapizada es "tela", no "madera").
 *   2. Entre materiales de estructura (madera, metal, cristal…) gana el que
 *      aparezca en la fuente más fiable: nombre del producto (handle) > tipo >
 *      tags > descripción. El nombre suele nombrar el material más voluminoso
 *      ("mesita auxiliar de metal…").
 *   3. Empate en la misma fuente: gana el material de superficie (mármol,
 *      cristal, cerámica, ratán, plástico, madera) sobre el de patas (metal).
 *
 * Cuándo correrlo: tras `sync-northdeco.ts` (el sync regenera el manifest y
 * pierde los campos extra) o cuando cambien los productos en la tienda.
 */
import fs from "node:fs";
import path from "node:path";

const MANIFEST = path.join(process.cwd(), "public", "northdeco", "manifest.json");

type ManItem = {
  file: string;
  url?: string | null;
  material?: string | null;
  materials?: string[];
  [k: string]: unknown;
};

// Palabras clave por material, sobre texto ya normalizado (minúsculas, sin acentos).
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

// Revestimientos: si están presentes, definen la pieza (una silla de madera
// tapizada en tela es "tela"). Piel por delante de tela.
const REVESTIMIENTOS = ["piel", "tela"];

// Desempate entre materiales de estructura hallados en la MISMA fuente:
// superficie/identidad primero, patas/armazón (metal) al final.
const ORDEN_ESTRUCTURA = ["marmol", "cristal", "ceramica", "ratan", "plastico", "madera", "metal"];

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function detectIn(text: string): string[] {
  const t = normalize(text);
  return RULES.filter(([, re]) => re.test(t)).map(([mat]) => mat);
}

/**
 * Elige el material dominante. `sources` va de más a menos fiable
 * (handle > tipo > tags > descripción).
 */
function pickMaterial(sources: string[]): { material: string | null; all: string[] } {
  const bestRank = new Map<string, number>();
  sources.forEach((src, rank) => {
    for (const mat of detectIn(src)) {
      if (!bestRank.has(mat)) bestRank.set(mat, rank);
    }
  });
  const all = [...bestRank.keys()];
  if (!all.length) return { material: null, all };

  for (const rev of REVESTIMIENTOS) {
    if (bestRank.has(rev)) return { material: rev, all };
  }
  const estructura = all
    .filter((m) => !REVESTIMIENTOS.includes(m))
    .sort((a, b) => {
      const byRank = bestRank.get(a)! - bestRank.get(b)!;
      if (byRank !== 0) return byRank;
      return ORDEN_ESTRUCTURA.indexOf(a) - ORDEN_ESTRUCTURA.indexOf(b);
    });
  return { material: estructura[0] ?? null, all };
}

function handleOf(url: string): string | null {
  const m = url.match(/\/products\/([^/?#]+)/);
  return m ? m[1] : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchProduct(handle: string): Promise<{ tags: string[]; type: string; desc: string } | null> {
  // Shopify limita ráfagas: hasta 3 intentos con pausa creciente.
  for (let intento = 0; intento < 3; intento++) {
    try {
      if (intento > 0) await sleep(1500 * intento);
      const res = await fetch(`https://northdeco.com/products/${handle}.js`, {
        headers: { accept: "application/json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) continue;
      const p: any = await res.json();
      return {
        tags: Array.isArray(p.tags) ? p.tags : [],
        type: String(p.type ?? ""),
        // La descripción viene en HTML; con quitar las etiquetas basta para buscar palabras.
        desc: String(p.description ?? "").replace(/<[^>]+>/g, " "),
      };
    } catch {
      /* reintentar */
    }
  }
  return null;
}

async function main() {
  const manifest: ManItem[] = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const cache = new Map<string, { material: string | null; all: string[] }>();
  let done = 0;

  const force = process.argv.includes("--force");

  for (const item of manifest) {
    // Sin --force, no repetir los que ya tienen material (permite re-lanzar
    // el script para rellenar solo los huecos si la tienda limitó peticiones).
    if (!force && item.material) {
      done++;
      continue;
    }
    const url = item.url ?? "";
    const handle = url ? handleOf(url) : null;
    let result: { material: string | null; all: string[] } = { material: null, all: [] };

    if (handle) {
      const cached = cache.get(handle);
      if (cached) {
        result = cached;
      } else {
        const p = await fetchProduct(handle);
        result = p
          ? pickMaterial([handle, p.type, p.tags.join(" "), p.desc])
          : pickMaterial([handle]);
        cache.set(handle, result);
        await sleep(150);
      }
    }
    item.material = result.material;
    item.materials = result.all;
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${manifest.length}…`);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 0));

  const counts = new Map<string, number>();
  let sin = 0;
  for (const m of manifest) {
    if (!m.material) sin++;
    else counts.set(m.material, (counts.get(m.material) ?? 0) + 1);
  }
  console.log(`\nOK — ${manifest.length} modelos enriquecidos.`);
  for (const [mat, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${mat}: ${n}`);
  console.log(`  sin material detectado: ${sin}`);
}

main().catch((e) => {
  console.error("FALLÓ:", e?.message ?? e);
  process.exit(1);
});
