"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AVATAR_SEEDS } from "@/lib/avatars";

export async function setAvatar(seed: string): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  if (!(AVATAR_SEEDS as readonly string[]).includes(seed)) return { ok: false };

  await prisma.user.updateMany({
    where: { id: session.user.id, active: true },
    data: { avatarSeed: seed },
  });
  revalidatePath("/oficina");
  return { ok: true };
}
