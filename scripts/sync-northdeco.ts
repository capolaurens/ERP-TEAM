/**
 * Sync de la galería pública /northdeco desde Google Drive (METADATA-ONLY).
 *
 * Uso:  npx tsx scripts/sync-northdeco.ts
 *
 * La galería sirve los modelos ORIGINALES de Drive al vuelo (vía el proxy
 * `/api/northdeco/model/[driveId]`), SIN comprimir → máxima calidad. Este script
 * NO descarga ni comprime nada: solo re-lista la carpeta NORTHDECO y regenera
 * `public/northdeco/manifest.json` con {file, fam, name, status, driveId,
 * modifiedTime}. Ligero y rápido.
 *
 * - `file` = nombre estable `familia__sku` = CLAVE del feedback (checks/coment.).
 *   No cambia aunque re-subas el modelo con otro fileId.
 * - `driveId` = fileId actual en Drive → lo usa el proxy para servir el original.
 *
 * Cuándo correrlo: cuando AÑADAS/QUITES modelos o cambie su fileId (borrar+subir).
 * Si solo reemplazas el CONTENIDO del mismo fichero (mismo fileId), el proxy ya
 * sirve la versión nueva sola. Tras correrlo: git add -A && commit && push.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";

const NORTHDECO_FOLDER = "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";
const PUB = path.join(process.cwd(), "public", "northdeco");
const MANIFEST = path.join(PUB, "manifest.json");

type ManItem = {
  file: string;
  fam: string;
  name: string;
  status: "listo" | "revision";
  driveId: string;
  modifiedTime: string;
};

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON en .env");
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const authClient = new googleAuth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return driveApi({ version: "v3", auth: authClient });
}

type Found = { id: string; sku: string; family: string; modifiedTime: string };

async function listAllGlbs(drive: any): Promise<Found[]> {
  const out: Found[] = [];
  async function walk(id: string, familyHint: string | null) {
    let pageToken: string | undefined;
    do {
      const res: any = await drive.files.list({
        q: `'${id}' in parents and trashed=false`,
        fields: "nextPageToken, files(id,name,mimeType,modifiedTime)",
        pageSize: 200,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (f.mimeType === "application/vnd.google-apps.folder") {
          const m = String(f.name).match(/ND-\d+/);
          await walk(f.id, m ? m[0] : familyHint);
        } else if (String(f.name).toLowerCase().endsWith(".glb")) {
          out.push({
            id: f.id,
            sku: String(f.name).replace(/\.glb$/i, ""),
            family: familyHint ?? "?",
            modifiedTime: f.modifiedTime ?? "",
          });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  await walk(NORTHDECO_FOLDER, null);
  return out;
}

const sane = (s: string) =>
  s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 44);

async function main() {
  fs.mkdirSync(PUB, { recursive: true });

  // Manifest previo: preservar estado (listo/revision) por familia.
  let prev: ManItem[] = [];
  try {
    prev = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {}
  const glassFamilies = new Set(
    prev.filter((p) => p.status === "revision").map((p) => p.fam),
  );

  const drive = driveClient();
  console.log("Listando NORTHDECO en Drive…");
  const all = await listAllGlbs(drive);
  const tex = all.filter((f) => !f.sku.toUpperCase().startsWith("ND-"));
  console.log(`  ${all.length} GLB en total · ${tex.length} texturizados (a mostrar).`);

  const manifest: ManItem[] = [];
  const usedNames = new Set<string>();
  for (const f of tex) {
    let base = `${sane(f.family)}__${sane(f.sku) || "modelo"}`;
    let fname = `${base}.glb`;
    let n = 2;
    while (usedNames.has(fname)) fname = `${base}_${n++}.glb`;
    usedNames.add(fname);
    manifest.push({
      file: fname,
      fam: f.family,
      name: /https?:\/\//i.test(f.sku) ? "Taburete" : f.sku.slice(0, 40),
      status: glassFamilies.has(f.family) ? "revision" : "listo",
      driveId: f.id,
      modifiedTime: f.modifiedTime,
    });
  }

  manifest.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 0));

  const listo = manifest.filter((m) => m.status === "listo").length;
  console.log(
    `\nSync OK — manifest con ${manifest.length} modelos (${listo} listos, ${manifest.length - listo} revisión).`,
  );
  console.log("Los modelos se sirven ORIGINALES desde Drive (sin comprimir).");
  console.log(
    "\nPublicar:\n  git add -A && git commit -m 'sync: manifest northdeco' && git push",
  );
}

main().catch((e) => {
  console.error("\nSync FALLÓ:", e?.message ?? e);
  process.exit(1);
});
