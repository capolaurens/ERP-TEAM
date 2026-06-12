import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { TasksView } from "./tasks-view";
import type { TaskCardData } from "./task-card";

export default async function TareasPage() {
  const user = await requireAuth();
  const teams = visibleTeams(user);

  const [tasksRaw, projects, members] = await Promise.all([
    prisma.task.findMany({
      where: { team: { in: teams } },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      include: { assignee: true, project: true },
    }),
    prisma.project.findMany({
      where: { team: { in: teams }, status: "active" },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true, team: { in: teams } },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = Date.now();
  const tasks: TaskCardData[] = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? formatDate(t.dueDate) : null,
    overdue: !!t.dueDate && t.status !== "DONE" && t.dueDate.getTime() < now,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tareas</h1>
        <p className="text-muted-foreground">
          Organiza el trabajo del equipo en tablero o tabla.
        </p>
      </div>
      <TasksView
        tasks={tasks}
        projects={projects.map((p) => ({ id: p.id, name: p.name, team: p.team }))}
        members={members.map((m) => ({ id: m.id, name: m.name, team: m.team! }))}
        role={user.role}
        userTeam={user.team}
      />
    </div>
  );
}
