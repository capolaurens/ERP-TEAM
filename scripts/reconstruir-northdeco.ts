/**
 * Reconstruye el manifest de /northdeco con SOLO los SKU validados.
 *
 * Uso:  npx tsx scripts/reconstruir-northdeco.ts lista-skus.txt
 *       (un SKU por línea; es la columna "Listado" del Sheet con la casilla 3D marcada)
 *
 * Para cada SKU busca en Drive el GLB de su carpeta ND-XXXX cuyo nombre coincida
 * (normalizando "#" ↔ "-"). Si un SKU no tiene archivo, lo dice y NO lo publica.
 * Deja el resto de campos vacíos: las fotos las pone sync-fotos-shopify.ts.
 */
import "dotenv/config";
import fs from "node:fs";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "../lib/google-credentials";

const NORTHDECO = process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";
const MANIFEST = "public/northdeco/manifest.json";
const listaPath = process.argv[2];
if (!listaPath) throw new Error("uso: reconstruir-northdeco.ts <fichero con los SKU>");

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new googleAuth.GoogleAuth({
  credentials: creds!,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});
const drive = driveApi({ version: "v3", auth });

/** Clave de comparación: solo alfanuméricos (ND-0606-BLACK#03 ≡ ND-0606-BLACK-03). */
const key = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const famOf = (s: string) => (s.toUpperCase().match(/ND-\d+/) ?? [""])[0];

/** Distancia de edición acotada: tolera erratas ("GRASSGREN"/"GRASSGREEN")
 *  y sufijos de copia ("... (2).glb"). */
function dist(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[a.length][b.length];
}

async function kids(id: string) {
  const r = await drive.files.list({
    q: `'${id}' in parents and trashed = false`,
    fields: "files(id,name,size,modifiedTime,mimeType)",
    pageSize: 1000,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
  });
  return (r.data.files ?? []) as {
    id: string; name: string; size?: string; modifiedTime?: string; mimeType?: string;
  }[];
}

async function main() {
  const skus = fs
    .readFileSync(listaPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("ND-"));
  console.log(`SKU validados en el Sheet: ${skus.length}`);

  // Índice de TODOS los GLB de la unidad, por clave de nombre.
  const porClave = new Map<string, { id: string; name: string; carpeta: string; mod?: string; size?: string }[]>();
  for (const carpeta of await kids(NORTHDECO)) {
    if (!carpeta.mimeType?.includes("folder")) continue;
    for (const g of await kids(carpeta.id)) {
      if (g.mimeType?.includes("folder")) continue;
      const k = key(g.name.replace(/\.glb$/i, ""));
      const arr = porClave.get(k) ?? [];
      arr.push({ id: g.id, name: g.name, carpeta: carpeta.name, mod: g.modifiedTime, size: g.size });
      porClave.set(k, arr);
    }
  }

  const out: Record<string, unknown>[] = [];
  const faltan: string[] = [];
  for (const sku of skus) {
    let cands = porClave.get(key(sku)) ?? [];
    if (!cands.length) {
      // Tolerancia a erratas: mismo family y nombre casi idéntico.
      const k = key(sku);
      const cercanos = [...porClave.entries()]
        .filter(([kk]) => kk.startsWith(key(famOf(sku))))
        .map(([kk, v]) => ({ kk, v, d: dist(k, kk) }))
        .filter((x) => x.d <= 3)
        .sort((a, b) => a.d - b.d);
      if (cercanos.length) {
        cands = cercanos[0].v;
        console.log(`  ~ ${sku} ≈ ${cands[0].name} (difiere en ${cercanos[0].d} carácter/es)`);
      }
    }
    if (!cands.length) {
      faltan.push(sku);
      continue;
    }
    // Si hay varios con el mismo nombre, el más reciente (el rehecho a mano).
    cands.sort((a, b) => (b.mod ?? "").localeCompare(a.mod ?? ""));
    const g = cands[0];
    out.push({
      file: `${sku.replace(/#/g, "_")}.glb`, // clave estable para checks y comentarios
      fam: famOf(sku),
      name: sku,
      status: "listo",
      driveId: g.id,
      modifiedTime: g.mod,
      img: null,
      url: null,
      variant: null,
      sku,
    });
    const dup = cands.length > 1 ? `  (⚠ ${cands.length} archivos con ese nombre)` : "";
    console.log(`  ✔ ${sku.padEnd(26)} → ${g.name} · ${((Number(g.size ?? 0))/1e6).toFixed(1)}MB · ${g.carpeta}${dup}`);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(out) + "\n");
  console.log(`\nManifest reconstruido: ${out.length} piezas`);
  if (faltan.length) {
    console.log(`SIN ARCHIVO EN DRIVE (${faltan.length}):`);
    for (const s of faltan) console.log("   ·", s);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
