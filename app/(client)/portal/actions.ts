"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { logActivity } from "@/lib/activity";

/** El cliente (o un admin) da/quita su visto bueno a una pieza TERMINADA de SU proyecto. */
export async function clientToggleApproval(formData: FormData) {
  const user = await requireAuth();
  const taskId = String(formData.get("taskId") ?? "");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { clientUsers: { select: { id: true } } } } },
  });
  if (!task) return;

  const isAdmin = user.role === "ADMIN";
  const linked = task.project?.clientUsers.some((c) => c.id === user.id) ?? false;
  if (!isAdmin && !(user.role === "CLIENT" && linked)) return;
  if (!task.textureApprovedAt) return; // solo piezas terminadas

  await prisma.task.update({
    where: { id: taskId },
    data: task.clientApprovedAt
      ? { clientApprovedAt: null, clientApprovedById: null }
      : { clientApprovedAt: new Date(), clientApprovedById: user.id },
  });
  await logActivity({
    type: "PHASE_CHANGED",
    actorId: user.id,
    taskId,
    meta: { toggle: "client", to: task.clientApprovedAt ? "off" : "on", by: "client" },
  });
  if (task.projectId) revalidatePath(`/portal/${task.projectId}`);
  revalidatePath(`/tareas/${taskId}`);
}
