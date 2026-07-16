import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { downloadFileStream, isDriveConfigured } from "@/lib/drive";

// Sirve el GLB ORIGINAL de Drive (sin comprimir, máxima calidad) para la galería
// pública /northdeco. El ERP hace de intermediario con la cuenta de servicio, así
// que el cliente NO necesita acceso a Drive. Público (bajo /api, sin login), pero
// solo sirve fileIds que estén en el manifest (no cualquier archivo de Drive).
// Streaming: no bufferiza el archivo en memoria (los originales pesan ~20MB).
export const runtime = "nodejs";
export const maxDuration = 120;

function allowedIds(): Set<string> {
  try {
    const m = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "northdeco", "manifest.json"), "utf8"),
    ) as { driveId?: string }[];
    return new Set(m.map((x) => x.driveId).filter(Boolean) as string[]);
  } catch {
    return new Set();
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id || !allowedIds().has(id)) {
    return new NextResponse("No encontrado", { status: 404 });
  }
  if (!isDriveConfigured()) {
    return new NextResponse("Drive no configurado", { status: 503 });
  }

  let dl;
  try {
    dl = await downloadFileStream(id);
  } catch (err) {
    console.error(`[api/northdeco/model/${id}] fallo al descargar:`, err);
    return new NextResponse("No se pudo cargar el modelo", { status: 502 });
  }

  const contentType = dl.name.toLowerCase().endsWith(".gltf")
    ? "model/gltf+json"
    : "model/gltf-binary";

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    // Cache moderado: reemplazar el modelo en Drive se refleja en unos minutos.
    "Cache-Control": "public, max-age=300",
  };
  if (dl.size) headers["Content-Length"] = String(dl.size);

  const webStream = Readable.toWeb(dl.stream as Readable) as ReadableStream;
  return new NextResponse(webStream, { headers });
}
