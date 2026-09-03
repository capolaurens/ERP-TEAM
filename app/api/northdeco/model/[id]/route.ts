import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { downloadFileStream, isDriveConfigured } from "@/lib/drive";
import { resolverFileId } from "@/lib/northdeco-resolver";

// Sirve el GLB ORIGINAL de Drive (sin comprimir, máxima calidad) para la galería
// pública /northdeco. El ERP hace de intermediario con la cuenta de servicio, así
// que el cliente NO necesita acceso a Drive. Público (bajo /api, sin login), pero
// solo sirve fileIds que estén en el manifest (no cualquier archivo de Drive).
// Streaming: no bufferiza el archivo en memoria (los originales pesan ~20MB).
export const runtime = "nodejs";
export const maxDuration = 120;

function manifest(): { file: string; driveId?: string }[] {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "northdeco", "manifest.json"), "utf8"),
    ) as { file: string; driveId?: string }[];
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const items = manifest();
  if (!id) return new NextResponse("No encontrado", { status: 404 });

  // El parámetro puede ser la CLAVE de la pieza (recomendado: se resuelve en
  // vivo por nombre en Drive, así una versión nueva se ve sin recablear nada)
  // o un fileId del manifest (compatibilidad con enlaces antiguos).
  let fileId: string | null = null;
  if (items.some((m) => m.file === id)) {
    fileId = await resolverFileId(id);
  } else if (items.some((m) => m.driveId === id)) {
    fileId = id;
  }
  if (!fileId) return new NextResponse("No encontrado", { status: 404 });

  if (!isDriveConfigured()) {
    return new NextResponse("Drive no configurado", { status: 503 });
  }

  let dl;
  try {
    dl = await downloadFileStream(fileId);
  } catch (err) {
    console.error(`[api/northdeco/model/${id}] fallo al descargar:`, err);
    return new NextResponse("No se pudo cargar el modelo", { status: 502 });
  }

  const contentType = dl.name.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : "model/gltf-binary";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // Caché corta: una versión nueva en Drive se ve en un minuto. El botón
    // "Actualizar desde Drive" de la galería fuerza la recarga al instante.
    "Cache-Control": "public, max-age=60",
  };
  if (dl.size) headers["Content-Length"] = String(dl.size);

  const webStream = Readable.toWeb(dl.stream as Readable) as ReadableStream;
  return new NextResponse(webStream, { headers });
}
