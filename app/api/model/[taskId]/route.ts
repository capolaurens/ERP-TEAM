import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";
import { downloadFile, extractDriveFileId, isDriveConfigured } from "@/lib/drive";

export const runtime = "nodejs";
// Los GLB pesan; damos margen para descargarlos desde Drive y servirlos.
export const maxDuration = 60;

/**
 * Sirve el GLB de una tarea desde Google Drive, con el ERP como intermediario.
 * El cliente NO necesita acceso a Drive: la cuenta de servicio descarga el
 * archivo (la carpeta debe estar compartida con `getServiceAccountEmail()`) y
 * el navegador lo carga vía `<model-viewer src="/api/model/[taskId]">`.
 *
 * Permisos: mismo criterio que `model-image/[id]` — miembro del equipo de la
 * tarea, o cliente vinculado al proyecto (o admin).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("No autorizado", { status: 401 });
  const { taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      team: true,
      driveUrl: true,
      project: { select: { clientUsers: { select: { id: true } } } },
    },
  });
  if (!task) return new NextResponse("No encontrado", { status: 404 });

  const u = session.user;
  const clientLinked =
    task.project?.clientUsers.some((c) => c.id === u.id) ?? false;
  const allowed =
    canAccessTeam(u, task.team) || (u.role === "CLIENT" && clientLinked);
  if (!allowed) return new NextResponse("Sin acceso", { status: 403 });

  if (!isDriveConfigured()) {
    return new NextResponse("Drive no configurado", { status: 503 });
  }

  const fileId = extractDriveFileId(task.driveUrl);
  if (!fileId) return new NextResponse("Esta pieza no tiene modelo 3D", { status: 404 });

  let file;
  try {
    file = await downloadFile(fileId);
  } catch (err) {
    console.error(`[api/model/${taskId}] fallo al descargar ${fileId}:`, err);
    return new NextResponse(
      "No se pudo cargar el modelo (¿la carpeta está compartida con la cuenta de servicio?)",
      { status: 502 },
    );
  }

  // Los .glb suelen llegar de Drive como application/octet-stream; forzamos el
  // mime correcto para que <model-viewer> lo interprete.
  const lower = file.name.toLowerCase();
  const contentType = lower.endsWith(".gltf")
    ? "model/gltf+json"
    : lower.endsWith(".glb")
      ? "model/gltf-binary"
      : file.mimeType.startsWith("model/")
        ? file.mimeType
        : "model/gltf-binary";

  const body = new Uint8Array(file.buffer);
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${file.name.replace(/"/g, "")}"`,
    },
  });
}
