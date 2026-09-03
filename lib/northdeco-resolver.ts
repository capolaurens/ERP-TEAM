import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";

/**
 * Resuelve EN VIVO qué archivo de Drive corresponde a cada pieza de la galería,
 * buscándolo POR NOMBRE dentro de la carpeta de su familia.
 *
 * Por qué: antes cada ficha guardaba un fileId fijo. Si el equipo subía una
 * versión nueva (archivo nuevo, no reemplazo), el id cambiaba y la galería
 * seguía sirviendo el archivo viejo — que Drive entrega incluso desde la
 * papelera. Resolviendo por nombre, subir un GLB con el nombre correcto basta
 * para que la galería lo muestre.
 */

const NORTHDECO_FOLDER =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

function client() {
  const auth = new googleAuth.GoogleAuth({
    credentials: creds!,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return driveApi({ version: "v3", auth });
}

/** Clave de comparación: solo alfanuméricos ("ND-0606-ARMYGREEN#46" ≡ "ND-0606-ARMYGREEN-46.glb"). */
const clave = (s: string) =>
  s.toUpperCase().replace(/\.GLB$/i, "").replace(/[^A-Z0-9]/g, "");

type Item = { file: string; fam: string; sku?: string | null; driveId: string };

function manifest(): Item[] {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public", "northdeco", "manifest.json"),
        "utf8",
      ),
    ) as Item[];
  } catch {
    return [];
  }
}

/* --- cachés (se vacían con `invalidar()`, que llama el botón de la galería) --- */
const TTL_MS = 60_000;
let carpetas: { at: number; porFam: Map<string, string> } | null = null;
const resueltos = new Map<string, { at: number; fileId: string }>();

export function invalidar(): void {
  carpetas = null;
  resueltos.clear();
}

async function carpetaDe(fam: string): Promise<string | null> {
  if (!carpetas || Date.now() - carpetas.at > 5 * 60_000) {
    const porFam = new Map<string, string>();
    const drive = client();
    let pageToken: string | undefined;
    do {
      const r = await drive.files.list({
        q: `'${NORTHDECO_FOLDER}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: "allDrives",
      });
      for (const f of r.data.files ?? []) {
        const m = (f.name ?? "").toUpperCase().match(/ND-\d+/);
        if (m && !porFam.has(m[0])) porFam.set(m[0], f.id!);
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    carpetas = { at: Date.now(), porFam };
  }
  return carpetas.porFam.get(fam.toUpperCase()) ?? null;
}

/**
 * Devuelve el fileId vigente de una pieza (clave `file` del manifest).
 * Si no encuentra nada por nombre, cae al `driveId` guardado.
 */
export async function resolverFileId(fileKey: string): Promise<string | null> {
  const item = manifest().find((m) => m.file === fileKey);
  if (!item) return null;
  if (!creds) return item.driveId;

  const cacheado = resueltos.get(fileKey);
  if (cacheado && Date.now() - cacheado.at < TTL_MS) return cacheado.fileId;

  try {
    const carpeta = await carpetaDe(item.fam);
    if (carpeta) {
      const r = await client().files.list({
        q: `'${carpeta}' in parents and trashed = false`,
        fields: "files(id,name,modifiedTime)",
        pageSize: 1000,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: "allDrives",
      });
      const objetivo = clave(item.sku ?? fileKey);
      const candidatos = (r.data.files ?? []).filter(
        (f) => clave(f.name ?? "") === objetivo,
      );
      // Si hay varias copias con el mismo nombre, la más reciente.
      candidatos.sort((a, b) =>
        (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""),
      );
      if (candidatos.length) {
        const fileId = candidatos[0].id!;
        resueltos.set(fileKey, { at: Date.now(), fileId });
        return fileId;
      }
    }
  } catch (e) {
    console.error("northdeco resolver:", e);
  }
  // Sin coincidencia por nombre: se mantiene el id conocido.
  resueltos.set(fileKey, { at: Date.now(), fileId: item.driveId });
  return item.driveId;
}
