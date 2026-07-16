/**
 * Sync de la galería pública /northdeco desde Google Drive.
 *
 * Uso:  npx tsx scripts/sync-northdeco.ts
 *
 * Qué hace: re-lista la carpeta NORTHDECO de la unidad compartida, coge los
 * modelos TEXTURIZADOS (nombre descriptivo/URL, no los "ND-####" que son malla
 * gris), y para cada uno — si cambió en Drive — lo baja, lo comprime con el
 * mega-compresor y lo deja en public/northdeco/models/. Regenera manifest.json.
 * Es INCREMENTAL: si un modelo no cambió (mismo modifiedTime), no lo re-baja.
 *
 * Nombres de fichero ESTABLES (familia__sku), para no romper los checks/
 * comentarios del cliente (que se guardan por nombre de fichero).
 *
 * Tras correrlo: git add -A && git commit && git push  → Railway redespliega.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { compressGlbBuffer } from "../lib/compressor";

const NORTHDECO_FOLDER = "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";
const PUB = path.join(process.cwd(), "public", "northdeco");
const OUT_DIR = path.join(PUB, "models");
const MANIFEST = path.join(PUB, "manifest.json");

type ManItem = {
  file: string;
  fam: string;
  name: string;
  status: "listo" | "revision";
  driveId?: string;
  modifiedTime?: string;
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
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Manifest previo: para preservar estado (listo/revision) por familia y saber
  // qué no ha cambiado (modifiedTime).
  let prev: ManItem[] = [];
  try {
    prev = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {}
  const prevByFile = new Map(prev.map((p) => [p.file, p]));
  const glassFamilies = new Set(
    prev.filter((p) => p.status === "revision").map((p) => p.fam),
  );

  const drive = driveClient();
  console.log("Listando NORTHDECO en Drive…");
  const all = await listAllGlbs(drive);
  // Texturizados = nombre NO empieza por "ND-" (esos son malla gris).
  const tex = all.filter((f) => !f.sku.toUpperCase().startsWith("ND-"));
  console.log(`  ${all.length} GLB en total · ${tex.length} texturizados (a mostrar).`);

  const manifest: ManItem[] = [];
  const keepFiles = new Set<string>();
  const usedNames = new Set<string>();
  let bajados = 0,
    reutilizados = 0,
    fallos = 0;

  for (const f of tex) {
    // Nombre estable y único.
    let base = `${sane(f.family)}__${sane(f.sku) || "modelo"}`;
    let fname = `${base}.glb`;
    let n = 2;
    while (usedNames.has(fname)) fname = `${base}_${n++}.glb`;
    usedNames.add(fname);
    keepFiles.add(fname);

    const dest = path.join(OUT_DIR, fname);
    const prevItem = prevByFile.get(fname);
    const unchanged =
      prevItem &&
      prevItem.modifiedTime === f.modifiedTime &&
      fs.existsSync(dest) &&
      fs.statSync(dest).size > 0;

    if (unchanged) {
      reutilizados++;
      process.stdout.write("·");
    } else {
      try {
        const res: any = await drive.files.get(
          { fileId: f.id, alt: "media", supportsAllDrives: true },
          { responseType: "arraybuffer" },
        );
        const buf = Buffer.from(res.data);
        let outBuf = buf;
        if (buf.length > 300 * 1024) {
          try {
            const r = await compressGlbBuffer(buf, {
              targetTris: 60000,
              textureMaxDim: 1024,
              textureQuality: 80,
            });
            if (r.bytesAfter > 0 && r.bytesAfter < buf.length) outBuf = r.buffer;
          } catch {}
        }
        fs.writeFileSync(dest, outBuf);
        bajados++;
        process.stdout.write(prevItem ? "↑" : "+");
      } catch (e) {
        fallos++;
        process.stdout.write("X");
        continue;
      }
    }

    const isGlass =
      glassFamilies.has(f.family) ||
      (prevItem && prevItem.status === "revision");
    manifest.push({
      file: fname,
      fam: f.family,
      name: /https?:\/\//i.test(f.sku) ? "Taburete" : f.sku.slice(0, 40),
      status: isGlass ? "revision" : "listo",
      driveId: f.id,
      modifiedTime: f.modifiedTime,
    });
  }

  // Borrar modelos locales que ya no están en Drive.
  let borrados = 0;
  for (const local of fs.readdirSync(OUT_DIR)) {
    if (local.endsWith(".glb") && !keepFiles.has(local)) {
      fs.unlinkSync(path.join(OUT_DIR, local));
      borrados++;
    }
  }

  manifest.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 0));

  const listo = manifest.filter((m) => m.status === "listo").length;
  console.log(
    `\n\nSync OK — ${manifest.length} modelos (${listo} listos, ${manifest.length - listo} revisión).`,
  );
  console.log(
    `  nuevos/actualizados: ${bajados} · sin cambios: ${reutilizados} · fallos: ${fallos} · borrados: ${borrados}`,
  );
  console.log(
    "\nAhora, para publicarlo:\n  cd '" +
      process.cwd() +
      "'\n  git add -A && git commit -m 'sync: galería northdeco' && git push\n(Railway redespliega solo al pushear.)",
  );
}

main().catch((e) => {
  console.error("\nSync FALLÓ:", e?.message ?? e);
  process.exit(1);
});
