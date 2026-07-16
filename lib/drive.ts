import { Readable } from "node:stream";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "@/lib/google-credentials";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

export function isDriveConfigured(): boolean {
  return !!creds;
}

/** Email de la cuenta de servicio — hay que compartir las carpetas con él. */
export function getServiceAccountEmail(): string | null {
  return creds?.client_email ?? null;
}

function getClient() {
  if (!creds) {
    throw new Error(
      "Google Drive no está configurado (falta GOOGLE_SERVICE_ACCOUNT_JSON).",
    );
  }
  const authClient = new googleAuth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveApi({ version: "v3", auth: authClient });
}

export type DriveUpload = {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink: string | null;
  mimeType: string;
  size: number;
};

export async function uploadToFolder(
  folderId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<DriveUpload> {
  const client = getClient();
  const res = await client.files.create({
    requestBody: { name: file.name, parents: [folderId] },
    media: { mimeType: file.mimeType, body: Readable.from(file.buffer) },
    fields: "id, name, webViewLink, webContentLink, size, mimeType",
    supportsAllDrives: true,
  });
  const d = res.data;
  return {
    id: d.id!,
    name: d.name ?? file.name,
    webViewLink: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
    webContentLink: d.webContentLink ?? null,
    mimeType: d.mimeType ?? file.mimeType,
    size: Number(d.size ?? file.buffer.length),
  };
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  const client = getClient();
  await client.files.delete({ fileId, supportsAllDrives: true });
}

/** Busca (o crea) una subcarpeta por nombre dentro de un padre. Devuelve su id. */
export async function getOrCreateFolder(
  parentId: string,
  name: string,
): Promise<string> {
  const client = getClient();
  const safe = name.replace(/['\\]/g, " ").trim() || "Sin nombre";
  const q = `name = '${safe}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const found = await client.files.list({
    q,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const hit = found.data.files?.[0];
  if (hit?.id) return hit.id;
  const created = await client.files.create({
    requestBody: {
      name: safe,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id!;
}

export function folderLink(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/**
 * Extrae el fileId de un enlace de Drive (`/file/d/<ID>/…`, `…?id=<ID>`,
 * `/folders/<ID>`) o devuelve el propio id si ya viene "pelado".
 */
export function extractDriveFileId(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const m =
    s.match(/\/(?:file\/d|d)\/([-\w]{20,})/) ||
    s.match(/[?&]id=([-\w]{20,})/) ||
    s.match(/\/folders\/([-\w]{20,})/);
  if (m) return m[1];
  if (/^[-\w]{20,}$/.test(s)) return s;
  return null;
}

export type DriveDownload = {
  buffer: Buffer;
  mimeType: string;
  name: string;
  size: number;
};

/**
 * Descarga los bytes de un archivo de Drive por su id usando la cuenta de
 * servicio. La carpeta que lo contiene debe estar compartida con el email de
 * `getServiceAccountEmail()`. Así el cliente puede ver el 3D sin acceso a Drive.
 */
export async function downloadFile(fileId: string): Promise<DriveDownload> {
  const client = getClient();
  const meta = await client.files.get({
    fileId,
    fields: "name, mimeType, size",
    supportsAllDrives: true,
  });
  const res = await client.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  const buffer = Buffer.from(res.data as ArrayBuffer);
  return {
    buffer,
    mimeType: meta.data.mimeType ?? "application/octet-stream",
    name: meta.data.name ?? "modelo",
    size: buffer.byteLength,
  };
}
