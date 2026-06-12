"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";
import { deleteDriveFile, isDriveConfigured } from "@/lib/drive";

export async function deleteAttachment(formData: FormData) {
  const session = await auth();
  if (!session?.user) return;
  const id = String(formData.get("id") ?? "");
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att || !canAccessTeam(session.user, att.team)) return;

  if (isDriveConfigured()) {
    try {
      await deleteDriveFile(att.driveFileId);
    } catch (e) {
      console.error("No se pudo borrar el archivo en Drive:", e);
    }
  }
  await prisma.attachment.delete({ where: { id } });
  revalidatePath(`/tareas/${att.taskId}`);
}
