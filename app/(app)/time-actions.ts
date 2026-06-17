"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { canAccessTeam } from "@/lib/rbac";
import type { ModelPhase } from "@/generated/prisma/enums";

/** Registro de tiempo MANUAL: el usuario indica cuánto tardó en la pieza. */
export async function addManualEntry(formData: FormData) {
  const user = await requireAuth();
  const taskId = String(formData.get("taskId") ?? "");
  const withAI = String(formData.get("withAI") ?? "") === "true";
  const note = String(formData.get("note") ?? "").trim() || null;
  const phaseRaw = String(formData.get("phase") ?? "");
  const phase: ModelPhase | null =
    phaseRaw === "MESH" || phaseRaw === "TEXTURE" ? phaseRaw : null;
  const hours = Math.max(0, parseInt(String(formData.get("hours") ?? "0"), 10) || 0);
  const mins = Math.max(0, parseInt(String(formData.get("minutes") ?? "0"), 10) || 0);
  const minutes = Math.max(1, Math.min(24 * 60, hours * 60 + mins));

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(user, task.team)) return;

  const now = new Date();
  const startedAt = new Date(now.getTime() - minutes * 60 * 1000);
  await prisma.timeEntry.create({
    data: {
      taskId,
      userId: user.id,
      withAI,
      phase,
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
