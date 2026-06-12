"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { ALL_TEAMS, canAccessTeam, defaultTeamFor } from "@/lib/rbac";
import { logActivity } from "@/lib/activity";
import { STATUS_ORDER } from "@/lib/tasks";
import { upsertTaskEvent, deleteTaskEvent } from "@/lib/calendar";
import { sendEmail, emailLayout, appUrl } from "@/lib/email";
import type { Team, TaskStatus, Priority } from "@/generated/prisma/enums";

type FormState = { error?: string; ok?: string };
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function parseDue(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createTask(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireAuth();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priority = String(formData.get("priority") ?? "MEDIUM") as Priority;
  const dueDate = parseDue(String(formData.get("dueDate") ?? ""));
  const projectId = String(formData.get("projectId") ?? "").trim() || null;
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  let team = String(formData.get("team") ?? "") as Team;

  if (user.role !== "ADMIN") {
    const t = defaultTeamFor(user);
    if (!t) return { error: "Tu usuario no tiene equipo asignado." };
    team = t;
  }

  if (!title) return { error: "El título es obligatorio." };
  if (!ALL_TEAMS.includes(team) || !canAccessTeam(user, team))
    return { error: "Equipo no válido." };
  if (!PRIORITIES.includes(priority)) return { error: "Prioridad no válida." };

  if (projectId) {
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    if (!p || p.team !== team)
      return { error: "El proyecto no pertenece a ese equipo." };
  }

  const order = await prisma.task.count({ where: { team, status: "TODO" } });
  const task = await prisma.task.create({
    data: {
      title,
      description,
      priority,
      dueDate,
      team,
      projectId,
      assigneeId,
      status: "TODO",
      order,
      createdById: user.id,
    },
  });
  await logActivity({
    type: "CREATED",
    actorId: user.id,
    taskId: task.id,
    meta: { title },
  });

  if (task.dueDate) {
    try {
      const eventId = await upsertTaskEvent({
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        googleEventId: null,
      });
      if (eventId)
        await prisma.task.update({
          where: { id: task.id },
          data: { googleEventId: eventId },
        });
    } catch {
      /* sincronización best-effort */
    }
  }

  if (assigneeId && assigneeId !== user.id) {
    try {
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
      if (assignee?.email)
        await sendEmail({
          to: assignee.email,
          subject: `Nueva tarea: ${title}`,
          html: emailLayout(
            "Te han asignado una tarea",
            `<strong>${user.name ?? "Alguien"}</strong> te ha asignado la tarea «${title}».`,
            appUrl(`/tareas/${task.id}`),
          ),
        });
    } catch {
      /* aviso best-effort */
    }
  }

  revalidatePath("/tareas");
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  return { ok: `Tarea «${title}» creada.` };
}

/** Llamada desde el tablero Kanban al soltar una tarjeta. */
export async function moveTask(
  taskId: string,
  status: TaskStatus,
  order: number,
) {
  const user = await requireAuth();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(user, task.team)) return;
  if (!STATUS_ORDER.includes(status)) return;

  if (task.status !== status) {
    await logActivity({
      type: "STATUS_CHANGED",
      actorId: user.id,
      taskId: task.id,
      meta: { from: task.status, to: status },
    });
  }
  await prisma.task.update({ where: { id: taskId }, data: { status, order } });
  revalidatePath("/tareas");
}

export async function updateTask(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !canAccessTeam(user, task.team)) return;

  const title = String(formData.get("title") ?? "").trim() || task.title;
  const description = String(formData.get("description") ?? "").trim() || null;
  const statusRaw = String(formData.get("status") ?? task.status) as TaskStatus;
  const priorityRaw = String(formData.get("priority") ?? task.priority) as Priority;
  const dueDate = parseDue(String(formData.get("dueDate") ?? ""));
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const projectId = String(formData.get("projectId") ?? "").trim() || null;

  const status = STATUS_ORDER.includes(statusRaw) ? statusRaw : task.status;
  const priority = PRIORITIES.includes(priorityRaw) ? priorityRaw : task.priority;

  let specific = false;
  if (status !== task.status) {
    specific = true;
    await logActivity({
      type: "STATUS_CHANGED",
      actorId: user.id,
      taskId: id,
      meta: { from: task.status, to: status },
    });
  }
  if ((task.assigneeId ?? "") !== (assigneeId ?? "")) {
    specific = true;
    await logActivity({
      type: "ASSIGNED",
      actorId: user.id,
      taskId: id,
      meta: { assigneeId: assigneeId ?? "" },
    });
  }
  if ((task.dueDate?.toISOString() ?? "") !== (dueDate?.toISOString() ?? "")) {
    specific = true;
    await logActivity({
      type: "DUE_CHANGED",
      actorId: user.id,
      taskId: id,
      meta: { dueDate: dueDate?.toISOString() ?? "" },
    });
  }
  if (!specific) {
    await logActivity({ type: "UPDATED", actorId: user.id, taskId: id });
  }

  await prisma.task.update({
    where: { id },
    data: { title, description, status, priority, dueDate, assigneeId, projectId },
  });

  try {
    if (dueDate) {
      const eventId = await upsertTaskEvent({
        id,
        title,
        description,
        dueDate,
        googleEventId: task.googleEventId,
      });
      if (eventId && eventId !== task.googleEventId)
        await prisma.task.update({ where: { id }, data: { googleEventId: eventId } });
    } else if (task.googleEventId) {
      await deleteTaskEvent(task.googleEventId);
      await prisma.task.update({ where: { id }, data: { googleEventId: null } });
    }
  } catch {
    /* sincronización best-effort */
  }

  if (assigneeId && assigneeId !== task.assigneeId && assigneeId !== user.id) {
    try {
      const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
      if (assignee?.email)
        await sendEmail({
          to: assignee.email,
          subject: `Tarea asignada: ${title}`,
          html: emailLayout(
            "Te han asignado una tarea",
            `<strong>${user.name ?? "Alguien"}</strong> te asignó la tarea «${title}».`,
            appUrl(`/tareas/${id}`),
          ),
        });
    } catch {
      /* aviso best-effort */
    }
  }

  revalidatePath(`/tareas/${id}`);
  revalidatePath("/tareas");
}

export async function addComment(formData: FormData) {
  const user = await requireAuth();
  const taskId = String(formData.get("taskId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || !canAccessTeam(user, task.team)) return;

  await prisma.comment.create({ data: { taskId, authorId: user.id, body } });
  await logActivity({
    type: "COMMENTED",
    actorId: user.id,
    taskId,
    meta: { excerpt: body.slice(0, 80) },
  });

  if (task.assigneeId && task.assigneeId !== user.id) {
    try {
      const assignee = await prisma.user.findUnique({
        where: { id: task.assigneeId },
      });
      if (assignee?.email)
        await sendEmail({
          to: assignee.email,
          subject: `Nuevo comentario: ${task.title}`,
          html: emailLayout(
            "Nuevo comentario en una tarea",
            `<strong>${user.name ?? "Alguien"}</strong> comentó en «${task.title}»:<br><br>${body.slice(0, 200)}`,
            appUrl(`/tareas/${taskId}`),
          ),
        });
    } catch {
      /* aviso best-effort */
    }
  }

  revalidatePath(`/tareas/${taskId}`);
}

export async function deleteTask(formData: FormData) {
  const user = await requireAuth();
  const id = String(formData.get("id") ?? "");
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !canAccessTeam(user, task.team)) return;
  try {
    await deleteTaskEvent(task.googleEventId);
  } catch {
    /* best-effort */
  }
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tareas");
  redirect("/tareas");
}
