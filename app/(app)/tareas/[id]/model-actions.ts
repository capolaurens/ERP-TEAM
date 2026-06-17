"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/session";
import { canAccessTeam } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

async function adminTask(taskId: string) {
  const user = await requireAdmin();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  return { user, task };
}

/** Validar la malla → pasa a la fase de textura. */
export async function approveMesh(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx || ctx.task.phase !== "MESH") return;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      phase: "TEXTURE",
      meshApprovedAt: new Date(),
      meshApprovedById: ctx.user.id,
      changesRequested: false,
    },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { approved: "MESH", to: "TEXTURE" },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Validar la textura → pieza completada (se marca como Hecho). */
export async function approveTexture(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx || ctx.task.phase !== "TEXTURE") return;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      phase: "DONE",
      textureApprovedAt: new Date(),
      textureApprovedById: ctx.user.id,
      changesRequested: false,
      status: "DONE",
    },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { approved: "TEXTURE", to: "DONE" },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Marcar el visto bueno del cliente (lo registra el admin). */
export async function markClientOK(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { clientApprovedAt: new Date(), clientApprovedById: ctx.user.id },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { client: true },
  });
  revalidatePath(`/tareas/${taskId}`);
}

/** Pedir cambios al equipo (deja un comentario y marca la pieza). */
export async function requestChanges(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const ctx = await adminTask(taskId);
  if (!ctx) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { changesRequested: true },
  });
  if (note) {
    await prisma.comment.create({
      data: { taskId, authorId: ctx.user.id, body: `🔧 Cambios solicitados: ${note}` },
    });
    await logActivity({ type: "COMMENTED", actorId: ctx.user.id, taskId });
  }
  revalidatePath(`/tareas/${taskId}`);
}

/** Deshacer la última validación (por si fue un error). */
export async function revertPhase(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx) return;
  const t = ctx.task;
  if (t.clientApprovedAt) {
    await prisma.task.update({
      where: { id: taskId },
      data: { clientApprovedAt: null, clientApprovedById: null },
    });
  } else if (t.phase === "DONE") {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        phase: "TEXTURE",
        textureApprovedAt: null,
        textureApprovedById: null,
        status: "IN_PROGRESS",
      },
    });
  } else if (t.phase === "TEXTURE") {
    await prisma.task.update({
      where: { id: taskId },
      data: { phase: "MESH", meshApprovedAt: null, meshApprovedById: null },
    });
  } else {
    return;
  }
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { revert: true },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Borrar una imagen (su autor o un admin). */
export async function deleteModelImage(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const img = await prisma.modelImage.findUnique({
    where: { id },
    include: { task: { select: { id: true, team: true } } },
  });
  if (!img) return;
  if (img.uploadedById !== user.id && user.role !== "ADMIN") return;
  if (!canAccessTeam(user, img.task.team)) return;
  await prisma.modelImage.delete({ where: { id } });
  revalidatePath(`/tareas/${img.task.id}`);
}
