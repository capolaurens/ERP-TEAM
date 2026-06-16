"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { canAccessTeam } from "@/lib/rbac";

/** Cierra el cronómetro activo del usuario (si lo hay) calculando su duración. */
async function stopRunningFor(userId: string) {
  const running = await prisma.timeEntry.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!running) return null;
  const now = new Date();
  const durationSec = Math.max(
    0,
    Math.floor((now.getTime() - running.startedAt.getTime()) / 1000),
  );
  await prisma.timeEntry.update({
    where: { id: running.id },
    data: { endedAt: now, durationSec },
  });
  return running;
}

export async function startTimer(formData: FormData) {
  const user = await requireAuth();
  const taskId = String(formData.get("taskId") ?? "");
  const withAI = String(formData.get("withAI") ?? "") === "true";
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(user, task.team)) return;

  await stopRunningFor(user.id); // solo un cronómetro a la vez
  await prisma.timeEntry.create({
    data: { taskId, userId: user.id, withAI, startedAt: new Date() },
  });

  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tiempo");
  revalidatePath("/", "layout");
}

export async function stopTimer() {
  const user = await requireAuth();
  const running = await stopRunningFor(user.id);
  if (running?.taskId) revalidatePath(`/tareas/${running.taskId}`);
  revalidatePath("/tiempo");
  revalidatePath("/", "layout");
}

export async function addManualEntry(formData: FormData) {
  const user = await requireAuth();
  const taskId = String(formData.get("taskId") ?? "");
  const withAI = String(formData.get("withAI") ?? "") === "true";
  const note = String(formData.get("note") ?? "").trim() || null;
  const minutes = Math.max(
    1,
    Math.min(24 * 60, parseInt(String(formData.get("minutes") ?? "0"), 10) || 0),
  );
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(user, task.team)) return;

  const now = new Date();
  const startedAt = new Date(now.getTime() - minutes * 60 * 1000);
  await prisma.timeEntry.create({
    data: {
      taskId,
      userId: user.id,
      withAI,
      startedAt,
      endedAt: now,
      durationSec: minutes * 60,
      note,
    },
  });

  revalidatePath(`/tareas/${taskId}`);
  revalidatePath("/tiempo");
}

export async function deleteTimeEntry(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const entry = await prisma.timeEntry.findUnique({ where: { id } });
  if (!entry) return;
  // Solo el dueño del registro o un admin pueden borrarlo.
  if (entry.userId !== user.id && user.role !== "ADMIN") return;
  await prisma.timeEntry.delete({ where: { id } });
  if (entry.taskId) revalidatePath(`/tareas/${entry.taskId}`);
  revalidatePath("/tiempo");
}
