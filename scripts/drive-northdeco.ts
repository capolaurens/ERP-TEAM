/**
 * Herramienta Drive para NORTHDECO — listar estructura y SUBIR modelos.
 *
 * La cuenta de servicio tiene EDIT en la carpeta NORTHDECO (shared drive
 * "NAVYX 3D"), así que podemos subir los GLB texturizados que exportamos de
 * Tripo directamente a la subcarpeta de familia correcta, sin intervención
 * manual. Cierra el círculo Tripo → ~/Downloads → Drive → sync → galería.
 *
 * Uso:
 *   npx tsx scripts/drive-northdeco.ts list
 *   npx tsx scripts/drive-northdeco.ts upload <archivo-local> <ND-####> <nombre-en-drive>
 *
 * Ej:  npx tsx scripts/drive-northdeco.ts upload ~/Downloads/Loop.glb ND-0545 Loop.glb
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";

const NORTHDECO_FOLDER = "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON en .env");
  const creds = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const authClient = new googleAuth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveApi({ version: "v3", auth: authClient });
}

function expandHome(p: string) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

type Node = { id: string; name: string; folders: Node[]; glbs: { id: string; name: string }[] };

async function listChildren(drive: any, id: string, name: string): Promise<Node> {
  const node: Node = { id, name, folders: [], glbs: [] };
  let pageToken: string | undefined;
  do {
    const res: any = await drive.files.list({
      q: `'${id}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType)",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of res.data.files ?? []) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        node.folders.push(await listChildren(drive, f.id, f.name));
      } else if (String(f.name).toLowerCase().endsWith(".glb")) {
        node.glbs.push({ id: f.id, name: f.name });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return node;
}

function printTree(node: Node, depth = 0) {
  const pad = "  ".repeat(depth);
  console.log(`${pad}📁 ${node.name}  [${node.id}]  (${node.glbs.length} glb)`);
  for (const g of node.glbs) console.log(`${pad}   • ${g.name}`);
  for (const f of node.folders) printTree(f, depth + 1);
}

/** Busca la subcarpeta de familia (nombre contiene ND-####) recursivamente. */
function findFamilyFolder(node: Node, family: string): Node | null {
  const fam = family.toUpperCase();
  for (const f of node.folders) {
    if (f.name.toUpperCase().includes(fam)) return f;
    const deep = findFamilyFolder(f, family);
    if (deep) return deep;
  }
  return null;
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const drive = driveClient();

  if (mode === "list") {
    console.log("Listando NORTHDECO…\n");
    const tree = await listChildren(drive, NORTHDECO_FOLDER, "NORTHDECO");
    printTree(tree);
    const countFolders = (n: Node): number =>
      n.folders.length + n.folders.reduce((s, f) => s + countFolders(f), 0);
    const countGlbs = (n: Node): number =>
      n.glbs.length + n.folders.reduce((s, f) => s + countGlbs(f), 0);
    console.log(`\n${countFolders(tree)} subcarpetas · ${countGlbs(tree)} GLB en total.`);
    return;
  }

  if (mode === "upload") {
    const [localArg, family, driveName] = rest;
    if (!localArg || !family || !driveName) {
      throw new Error("Uso: upload <archivo-local> <ND-####> <nombre-en-drive>");
    }
    const local = expandHome(localArg);
    if (!fs.existsSync(local)) throw new Error(`No existe: ${local}`);
    const buffer = fs.readFileSync(local);

    console.log("Buscando carpeta de familia en Drive…");
    const tree = await listChildren(drive, NORTHDECO_FOLDER, "NORTHDECO");
    let target = findFamilyFolder(tree, family);
    let folderId: string;
    if (target) {
      folderId = target.id;
      console.log(`  → subo a carpeta existente "${target.name}" [${folderId}]`);
    } else {
      console.log(`  → no existe carpeta ${family}; la creo en NORTHDECO`);
      const created = await drive.files.create({
        requestBody: {
          name: family,
          mimeType: "application/vnd.google-apps.folder",
          parents: [NORTHDECO_FOLDER],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      folderId = created.data.id!;
    }

    const res = await drive.files.create({
      requestBody: { name: driveName, parents: [folderId] },
      media: { mimeType: "model/gltf-binary", body: Readable.from(buffer) },
      fields: "id, name, size, webViewLink",
      supportsAllDrives: true,
    });
    console.log(
      `\nSubido ✓  ${res.data.name}  [${res.data.id}]  ${((Number(res.data.size) || buffer.length) / 1e6).toFixed(1)} MB`,
    );
    console.log(res.data.webViewLink);
    return;
  }

  throw new Error("Modo no reconocido. Usa: list | upload");
}

main().catch((e) => {
  console.error("\nERROR:", e?.message ?? e);
  process.exit(1);
});
