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

/** Casilla "Malla": validar/quitar. Al quitar, se resetea lo posterior. */
export async function toggleMesh(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx) return;
  const t = ctx.task;
  if (t.meshApprovedAt) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        meshApprovedAt: null,
        meshApprovedById: null,
        textureApprovedAt: null,
        textureApprovedById: null,
        clientApprovedAt: null,
        clientApprovedById: null,
        phase: "MESH",
        status: t.status === "DONE" ? "IN_PROGRESS" : t.status,
      },
    });
  } else {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        meshApprovedAt: new Date(),
        meshApprovedById: ctx.user.id,
        phase: "TEXTURE",
        changesRequested: false,
      },
    });
  }
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { toggle: "mesh", to: t.meshApprovedAt ? "off" : "on" },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Casilla "Textura": requiere malla validada. */
export async function toggleTexture(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx || !ctx.task.meshApprovedAt) return;
  const t = ctx.task;
  if (t.textureApprovedAt) {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        textureApprovedAt: null,
        textureApprovedById: null,
        clientApprovedAt: null,
        clientApprovedById: null,
        phase: "TEXTURE",
        status: t.status === "DONE" ? "IN_PROGRESS" : t.status,
      },
    });
  } else {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        textureApprovedAt: new Date(),
        textureApprovedById: ctx.user.id,
        phase: "DONE",
        status: "DONE",
        changesRequested: false,
      },
    });
  }
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { toggle: "texture", to: t.textureApprovedAt ? "off" : "on" },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Casilla "Cliente": requiere textura validada. Lo marca el admin. */
export async function toggleClient(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await adminTask(taskId);
  if (!ctx || !ctx.task.textureApprovedAt) return;
  const t = ctx.task;
  await prisma.task.update({
    where: { id: taskId },
    data: t.clientApprovedAt
      ? { clientApprovedAt: null, clientApprovedById: null }
      : { clientApprovedAt: new Date(), clientApprovedById: ctx.user.id },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: ctx.user.id,
    taskId,
    meta: { toggle: "client", to: t.clientApprovedAt ? "off" : "on" },
  });
  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tareas");
}

/** Pedir cambios: deja un comentario y marca la pieza. */
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
