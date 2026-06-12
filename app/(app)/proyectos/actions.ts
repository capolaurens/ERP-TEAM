"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { ALL_TEAMS, canAccessTeam, defaultTeamFor } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import type { Team } from "@/generated/prisma/enums";

type FormState = { error?: string; ok?: string };

export async function createProject(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  let team = String(formData.get("team") ?? "") as Team;

  if (user.role !== "ADMIN") {
    const t = defaultTeamFor(user);
    if (!t) return { error: "Tu usuario no tiene equipo asignado." };
    team = t;
  }

  if (!name) return { error: "El nombre es obligatorio." };
  if (!ALL_TEAMS.includes(team)) return { error: "Selecciona un equipo válido." };
  if (!canAccessTeam(user, team))
    return { error: "No puedes crear proyectos en ese equipo." };

  const project = await prisma.project.create({
    data: { name, description, team, createdById: user.id },
  });
  await logActivity({
    type: "CREATED",
    actorId: user.id,
    projectId: project.id,
    meta: { name },
  });

  revalidatePath("/proyectos");
  return { ok: `Proyecto «${name}» creado.` };
}

export async function toggleArchiveProject(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !canAccessTeam(user, project.team)) return;
  const status = project.status === "archived" ? "active" : "archived";
  await prisma.project.update({ where: { id }, data: { status } });
  revalidatePath("/proyectos");
}

export async function deleteProject(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !canAccessTeam(user, project.team)) return;
  await prisma.project.delete({ where: { id } });
  revalidatePath("/proyectos");
}
