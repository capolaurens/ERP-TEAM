"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import type { Role } from "@/generated/prisma/enums";

type FormState = { error?: string; ok?: string };
const STATUSES = ["idea", "planned", "published"];

function canManage(role: Role) {
  return role === "ADMIN" || role === "MARKETING";
}

function parseDate(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createPost(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAuth();
  if (!canManage(user.role)) return { error: "No autorizado." };

  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "idea");
  const scheduledAt = parseDate(String(formData.get("scheduledAt") ?? ""));
  if (!STATUSES.includes(status)) return { error: "Estado no válido." };
  if (!imageUrl && !caption)
    return { error: "Añade al menos una imagen o un texto." };

  const count = await prisma.instagramPost.count();
  await prisma.instagramPost.create({
    data: { imageUrl, caption, status, scheduledAt, order: count, createdById: user.id },
  });
  revalidatePath("/feed");
  return { ok: "Publicación añadida." };
}

export async function updatePost(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAuth();
  if (!canManage(user.role)) return { error: "No autorizado." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Publicación no válida." };
  const imageUrl = String(formData.get("imageUrl") ?? "").trim() || null;
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "idea");
  const scheduledAt = parseDate(String(formData.get("scheduledAt") ?? ""));
  if (!STATUSES.includes(status)) return { error: "Estado no válido." };

  await prisma.instagramPost.update({
    where: { id },
    data: { imageUrl, caption, status, scheduledAt },
  });
  revalidatePath("/feed");
  return { ok: "Cambios guardados." };
}

export async function deletePost(formData: FormData) {
  const user = await requireAuth();
  if (!canManage(user.role)) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.instagramPost.delete({ where: { id } });
  revalidatePath("/feed");
}

export async function reorderPosts(orderedIds: string[]) {
  const user = await requireAuth();
  if (!canManage(user.role)) return;
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.instagramPost.update({ where: { id }, data: { order: index } }),
    ),
  );
  revalidatePath("/feed");
}
