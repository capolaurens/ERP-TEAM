import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";
import { prisma } from "./prisma";

/**
 * Estado visual de la revisión del cliente en las CARPETAS de Drive de Northdeco:
 *   "ND-XXXX ✅"  → todas las piezas de esa carpeta con visto bueno y sin comentarios
 *   "ND-XXXX 🟡" → alguna pieza con comentario (hay que revisarla)
 *   "ND-XXXX"    → pendiente / sin feedback
 * Se llama (best-effort) desde el endpoint público de feedback de la galería.
 */

const NORTHDECO_FOLDER_ID =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

function client() {
  const auth = new googleAuth.GoogleAuth({
    credentials: creds!,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveApi({ version: "v3", auth });
}

const skuOf = (name: string) =>
  (name.match(/ND-[A-Za-z0-9-]+/i) ?? [""])[0].toUpperCase();

type Manifest = { file: string; fam: string }[];
function manifest(): Manifest {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public/northdeco/manifest.json"),
        "utf8",
      ),
    ) as Manifest;
  } catch {
    return [];
  }
}

/* Caché de subcarpetas ND-XXXX (5 min) para no listar Drive en cada clic. */
let foldersCache: {
  at: number;
  bySku: Map<string, { id: string; name: string }>;
} | null = null;

async function folders(force = false) {
  if (!force && foldersCache && Date.now() - foldersCache.at < 5 * 60_000) {
    return foldersCache.bySku;
  }
  const drive = client();
  const bySku = new Map<string, { id: string; name: string }>();
  let pageToken: string | undefined;
  do {
    const r = await drive.files.list({
      q: `'${NORTHDECO_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });
    for (const f of r.data.files ?? []) {
      const sku = skuOf(f.name ?? "");
      if (sku) bySku.set(sku, { id: f.id!, name: f.name! });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  foldersCache = { at: Date.now(), bySku };
  return bySku;
}

/**
 * Recalcula y aplica el emoji de la carpeta a la que pertenece `fileKey`
 * (clave del manifest). Si la carpeta agrupa varias variantes, agrega:
 * 🟡 si CUALQUIERA tiene comentario; ✅ solo si TODAS están validadas.
 */
export async function syncNorthdecoFolderBadge(fileKey: string): Promise<void> {
  if (!creds) return; // sin credenciales: no-op
  const items = manifest();
  const fam = items.find((m) => m.file === fileKey)?.fam?.toUpperCase();
  if (!fam) return;
  const familyFiles = items
    .filter((m) => m.fam.toUpperCase() === fam)
    .map((m) => m.file);

  const [reviews, commentCount] = await Promise.all([
    prisma.northdecoReview.findMany({
      where: { file: { in: familyFiles }, checked: true },
      select: { file: true },
    }),
    prisma.northdecoComment.count({ where: { file: { in: familyFiles } } }),
  ]);
  const checkedSet = new Set(reviews.map((r) => r.file));
  const allChecked = familyFiles.every((f) => checkedSet.has(f));

  const badge = commentCount > 0 ? "🟡" : allChecked ? "✅" : "";
  const desired = badge ? `${fam} ${badge}` : fam;

  let folder = (await folders()).get(fam);
  if (!folder) folder = (await folders(true)).get(fam); // caché fría
  if (!folder || folder.name === desired) return;

  await client().files.update({
    fileId: folder.id,
    requestBody: { name: desired },
    supportsAllDrives: true,
  });
  folder.name = desired; // refresca la caché
}
