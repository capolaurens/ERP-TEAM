"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { canAccessTeam } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";

/**
 * Permite actuar sobre una pieza si el usuario pertenece al equipo dueño de la
 * tarea (o es admin). Es la vista interna del equipo (chicos de prácticas),
 * distinta del portal del cliente.
 */
async function requireTeamAccess(taskId: string) {
  const user = await requireAuth();
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      team: true,
      projectId: true,
      meshSubmittedAt: true,
      textureSubmittedAt: true,
      meshApprovedAt: true,
      textureApprovedAt: true,
    },
  });
  if (!task) return null;
  if (!task.team || !canAccessTeam(user, task.team)) return null;
  return { user, task };
}

/**
 * El CHICO marca/retira que ha ENVIADO la malla (la terminó). No aprueba nada —
 * eso lo hace el admin después. No se puede retirar si el admin ya la aprobó.
 */
export async function teamToggleMesh(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await requireTeamAccess(taskId);
  if (!ctx) return;
  const { user, task } = ctx;
  const turningOn = !task.meshSubmittedAt;
  if (!turningOn && task.meshApprovedAt) return; // ya aprobada: no se retira
  await prisma.task.update({
    where: { id: taskId },
    data: { meshSubmittedAt: turningOn ? new Date() : null },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { team: "malla", to: turningOn ? "enviada" : "retirada", by: "equipo" },
  });
}

/**
 * El CHICO marca/retira que ha ENVIADO la textura. No se puede retirar si el
 * admin ya la aprobó.
 */
export async function teamToggleTexture(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const ctx = await requireTeamAccess(taskId);
  if (!ctx) return;
  const { user, task } = ctx;
  const turningOn = !task.textureSubmittedAt;
  if (!turningOn && task.textureApprovedAt) return;
  await prisma.task.update({
    where: { id: taskId },
    data: { textureSubmittedAt: turningOn ? new Date() : null },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { team: "textura", to: turningOn ? "enviada" : "retirada", by: "equipo" },
  });
}

/** El EQUIPO pega/edita/borra el link de Drive del modelo de la pieza. */
export async function teamSetDriveUrl(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const ctx = await requireTeamAccess(taskId);
  if (!ctx) return;
  const { user, task } = ctx;
  await prisma.task.update({
    where: { id: taskId },
    data: { driveUrl: url || null },
  });
  await logActivity({
    type: "UPDATED",
    actorId: user.id,
    taskId,
    meta: { field: "driveUrl", by: "equipo" },
  });
  // El link cambia si aparece el visor 3D → revalidamos la página del proyecto.
  if (task.projectId) revalidatePath(`/proyectos/${task.projectId}`);
}
