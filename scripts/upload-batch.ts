/**
 * Sube VARIOS GLB a sus subcarpetas de familia en una sola pasada (lista el
 * árbol NORTHDECO UNA vez). Mucho más rápido que llamar upload N veces.
 *
 * Uso: npx tsx scripts/upload-batch.ts "Nombre:ND-####,Nombre2:ND-####,..."
 * Los archivos se buscan en ~/Downloads/<Nombre>.glb (o <Nombre>*.glb).
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";

const NORTHDECO = "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const authClient = new googleAuth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveApi({ version: "v3", auth: authClient });
}

async function familyFolders(drive: any): Promise<Record<string, string>> {
  // Solo subcarpetas de primer nivel de NORTHDECO (cada familia ND-#### es una).
  const map: Record<string, string> = {};
  let pageToken: string | undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${NORTHDECO}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      const m = String(f.name).toUpperCase().match(/ND-\d+/);
      if (m) map[m[0]] = f.id;
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return map;
}

function findLocal(name: string): string | null {
  const dl = path.join(os.homedir(), "Downloads");
  const exact = path.join(dl, `${name}.glb`);
  if (fs.existsSync(exact)) return exact;
  const cands = fs
    .readdirSync(dl)
    .filter((f) => f.startsWith(name) && f.endsWith(".glb"))
    .map((f) => path.join(dl, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return cands[0] ?? null;
}

async function main() {
  const spec = process.argv[2];
  if (!spec) throw new Error('Uso: upload-batch "Nombre:ND-####,..."');
  const pairs = spec.split(",").map((p) => {
    const [name, fam] = p.split(":");
    return { name: name.trim(), fam: fam.trim().toUpperCase() };
  });

  const drive = driveClient();
  console.log("Listando familias de NORTHDECO…");
  const folders = await familyFolders(drive);
  console.log(`  ${Object.keys(folders).length} familias.\n`);

  for (const { name, fam } of pairs) {
    const local = findLocal(name);
    if (!local) {
      console.log(`✗ ${name}: no encontrado en ~/Downloads`);
      continue;
    }
    let folderId = folders[fam];
    if (!folderId) {
      const created = await drive.files.create({
        requestBody: {
          name: fam,
          mimeType: "application/vnd.google-apps.folder",
          parents: [NORTHDECO],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      folderId = created.data.id!;
      folders[fam] = folderId;
    }
    const buf = fs.readFileSync(local);
    const res = await drive.files.create({
      requestBody: { name: `${name}.glb`, parents: [folderId] },
      media: { mimeType: "model/gltf-binary", body: Readable.from(buf) },
      fields: "id, size",
      supportsAllDrives: true,
    });
    console.log(
      `✓ ${name} → ${fam}  (${(buf.length / 1e6).toFixed(1)}MB)  [${res.data.id}]`,
    );
  }
  console.log("\nListo. Ahora: npx tsx scripts/sync-northdeco.ts && git push");
}

main().catch((e) => {
  console.error("ERROR:", e?.message ?? e);
  process.exit(1);
});
