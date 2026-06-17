import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";
import type { ModelPhase } from "@/generated/prisma/enums";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB por imagen

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const form = await req.formData();
  const taskId = String(form.get("taskId") ?? "");
  const phaseRaw = String(form.get("phase") ?? "MESH");
  const phase: ModelPhase =
    phaseRaw === "TEXTURE" ? "TEXTURE" : phaseRaw === "DONE" ? "DONE" : "MESH";
  const kind = String(form.get("kind") ?? "progress") === "reference" ? "reference" : "progress";
  const file = form.get("file");

  if (!taskId || !(file instanceof File)) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se permiten imágenes." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen supera el límite de 12 MB." }, { status: 400 });
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(session.user, task.team)) {
    return NextResponse.json({ error: "Sin acceso a esta tarea." }, { status: 403 });
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  await prisma.modelImage.create({
    data: {
      taskId,
      phase,
      kind,
      data: buffer,
      mimeType: file.type || "image/png",
      fileName: file.name || "imagen",
      uploadedById: session.user.id,
    },
  });

  revalidatePath(`/tareas/${taskId}`);
  return NextResponse.json({ ok: true });
}
