"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ALL_ROLES, roleTeam } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

type FormState = { error?: string; ok?: string };

export async function createUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const projectIds = formData.getAll("projectIds").map(String).filter(Boolean);

  if (!name || !email.includes("@") || password.length < 8 || !ALL_ROLES.includes(role)) {
    return {
      error: "Revisa los campos: email válido y contraseña de mínimo 8 caracteres.",
    };
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Ya existe un usuario con ese email." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      team: roleTeam(role),
      ...(role === "CLIENT" && projectIds.length
        ? { clientProjects: { connect: projectIds.map((pid) => ({ id: pid })) } }
        : {}),
    },
  });

  revalidatePath("/admin/usuarios");
  return { ok: `Usuario «${name}» creado correctamente.` };
}

export async function updateRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!id || !ALL_ROLES.includes(role)) return;
  await prisma.user.update({
    where: { id },
    data: { role, team: roleTeam(role) },
  });
  revalidatePath("/admin/usuarios");
}

export async function toggleActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/admin/usuarios");
}

export async function deleteUser(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === me.id) return; // nunca eliminarse a sí mismo
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/usuarios");
}

export async function editUser(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const projectIds = formData.getAll("projectIds").map(String).filter(Boolean);

  if (!id) return { error: "Usuario no válido." };
  if (!name || !email.includes("@"))
    return { error: "Nombre y email válidos son obligatorios." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id)
    return { error: "Ese email ya está en uso por otro usuario." };

  const data: { name: string; email: string; passwordHash?: string } = {
    name,
    email,
  };
  if (newPassword) {
    if (newPassword.length < 8)
      return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id }, data });

  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (target?.role === "CLIENT") {
    await prisma.user.update({
      where: { id },
      data: { clientProjects: { set: projectIds.map((pid) => ({ id: pid })) } },
    });
  }

  revalidatePath("/admin/usuarios");
  return {
    ok: newPassword
      ? `Usuario «${name}» actualizado y contraseña restablecida.`
      : `Usuario «${name}» actualizado.`,
  };
}
