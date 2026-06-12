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
