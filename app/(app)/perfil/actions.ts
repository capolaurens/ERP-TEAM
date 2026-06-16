"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";

type State = { error?: string; ok?: string };

export async function changeOwnPassword(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const sessionUser = await requireAuth();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");

  if (next.length < 8)
    return { error: "La nueva contraseña debe tener al menos 8 caracteres." };

  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) return { error: "Usuario no encontrado." };

  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) return { error: "La contraseña actual no es correcta." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return { ok: "Contraseña actualizada correctamente." };
}
