"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { logActivity } from "@/lib/activity";

function taskWithClients(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { clientUsers: { select: { id: true } } } } },
  });
}

async function requireClientOrAdmin(taskId: string) {
  const user = await requireAuth();
  const task = await taskWithClients(taskId);
  if (!task) return null;
  const isAdmin = user.role === "ADMIN";
  const linked = task.project?.clientUsers.some((c) => c.id === user.id) ?? false;
  if (!isAdmin && !(user.role === "CLIENT" && linked)) return null;
  return { user, task };
}

/**
 * Revalida la página de la tarea del equipo. Los toggles del portal usan UI
 * optimista (cambian al instante en el cliente), por eso NO revalidamos el
 * portal aquí: así evitamos refetch de las ~200 filas en cada click. El portal
 * es dinámico (lee la sesión), así que se recarga fresco de BD en cada visita.
 */
function revalidate(taskId: string) {
  revalidatePath(`/tareas/${taskId}`);
}

/** El CLIENTE (o admin) marca/quita que valida la MALLA de una pieza suya. */
export async function clientToggleMesh(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await requireClientOrAdmin(taskId);
  if (!ctx) return;
  const { user, task } = ctx;
  await prisma.task.update({
    where: { id: taskId },
    data: { clientMeshAt: task.clientMeshAt ? null : new Date() },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { client: "malla", to: task.clientMeshAt ? "off" : "on" },
  });
  revalidate(taskId);
}

/** El CLIENTE (o admin) marca/quita que valida la TEXTURA de una pieza suya. */
export async function clientToggleTexture(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await requireClientOrAdmin(taskId);
  if (!ctx) return;
  const { user, task } = ctx;
  await prisma.task.update({
    where: { id: taskId },
    data: { clientTextureAt: task.clientTextureAt ? null : new Date() },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { client: "textura", to: task.clientTextureAt ? "off" : "on" },
  });
  revalidate(taskId);
}

/**
 * SOLO ADMIN: abre/cierra la pieza al cliente (gate "Tu validación"). Si está
 * en off, la pieza NO le aparece al cliente en su portal.
 */
export async function adminToggleShow(formData: FormData) {
  const user = await requireAuth();
  if (user.role !== "ADMIN") return;
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, showToClient: true },
  });
  if (!task) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { showToClient: !task.showToClient },
  });
  await logActivity({
    type: "UPDATED",
    actorId: user.id,
    taskId,
    meta: { showToClient: !task.showToClient, by: "admin" },
  });
  revalidate(taskId);
}

/**
 * SOLO ADMIN: marca/quita que el equipo (chicos de prácticas) ha ENTREGADO la
 * malla. Mientras esté en off, el cliente NO puede aprobar la malla (su check
 * sale bloqueado). Es la aprobación interna que desbloquea al cliente.
 */
export async function adminToggleMesh(formData: FormData) {
  const user = await requireAuth();
  if (user.role !== "ADMIN") return;
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, meshApprovedAt: true },
  });
  if (!task) return;
  const on = !task.meshApprovedAt;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      meshApprovedAt: on ? new Date() : null,
      // Al aprobar la malla, la pieza se ABRE sola al cliente para su check.
      ...(on ? { showToClient: true } : {}),
    },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { team: "malla", to: on ? "on" : "off", by: "admin" },
  });
  revalidate(taskId);
}

/**
 * SOLO ADMIN: marca/quita que el equipo ha ENTREGADO la textura. Mientras esté
 * en off, el cliente NO puede aprobar la textura.
 */
export async function adminToggleTexture(formData: FormData) {
  const user = await requireAuth();
  if (user.role !== "ADMIN") return;
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, textureApprovedAt: true },
  });
  if (!task) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { textureApprovedAt: task.textureApprovedAt ? null : new Date() },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { team: "textura", to: task.textureApprovedAt ? "off" : "on", by: "admin" },
  });
  revalidate(taskId);
}

/**
 * El cliente reporta un error / pide un cambio en una pieza de SU proyecto.
 * Deja un comentario y marca `changesRequested`. El equipo lo ve en la tarea.
 */
export async function clientRequestChanges(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const ctx = await requireClientOrAdmin(taskId);
  if (!ctx) return;
  const { user, task } = ctx;

  await prisma.comment.create({
    data: {
      taskId,
      authorId: user.id,
      body: `🔧 Cambios pedidos por el cliente: ${body}`,
    },
  });
  await prisma.task.update({
    where: { id: taskId },
    data: { changesRequested: true },
  });
  await logActivity({
    type: "COMMENTED",
    actorId: user.id,
    taskId,
    meta: { by: "client", changesRequested: true },
  });
  revalidate(taskId);
  if (task.projectId) revalidatePath(`/portal/${task.projectId}`);
}
