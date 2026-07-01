import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";
import { isDriveConfigured, uploadToFolder, getOrCreateFolder } from "@/lib/drive";
import { getTeamFolderId } from "@/lib/team-folders";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive no está configurado todavía." },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const taskId = String(form.get("taskId") ?? "");
  const file = form.get("file");

  if (!taskId || !(file instanceof File)) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el límite de 25 MB." },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(session.user, task.team)) {
    return NextResponse.json({ error: "Sin acceso a esta tarea." }, { status: 403 });
  }

  const driveRoot = await getTeamFolderId(task.team);
  if (!driveRoot) {
    return NextResponse.json(
      {
        error: `No hay carpeta de Drive configurada para el equipo. Un administrador debe asignarla en Ajustes.`,
      },
      { status: 400 },
    );
  }

  try {
    // Organiza sin tocar tu estructura: <unidad> / Subidas ERP / <proyecto> / <pieza>
    const projName = task.projectId
      ? (
          await prisma.project.findUnique({
            where: { id: task.projectId },
            select: { name: true },
          })
        )?.name ?? "Sin proyecto"
      : "Sin proyecto";
    const base = await getOrCreateFolder(driveRoot, "Subidas ERP");
    const projFolder = await getOrCreateFolder(base, projName);
    const pieceFolder = await getOrCreateFolder(projFolder, task.title);

    const buffer = Buffer.from(await file.arrayBuffer());
    const up = await uploadToFolder(pieceFolder, {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    const att = await prisma.attachment.create({
      data: {
        taskId,
        fileName: up.name,
        mimeType: up.mimeType,
        size: up.size,
        team: task.team,
        driveFileId: up.id,
        driveUrl: up.webViewLink,
        driveDownloadUrl: up.webContentLink,
        uploadedById: session.user.id,
      },
    });
    await logActivity({
      type: "FILE_UPLOADED",
      actorId: session.user.id,
      taskId,
      meta: { fileName: up.name },
    });

    revalidatePath(`/tareas/${taskId}`);
    return NextResponse.json({ ok: true, id: att.id });
  } catch (e) {
    console.error("Error subiendo a Drive:", e);
    return NextResponse.json(
      {
        error:
          "Error al subir a Drive. Comprueba que la carpeta está compartida con la cuenta de servicio.",
      },
      { status: 500 },
    );
  }
}
