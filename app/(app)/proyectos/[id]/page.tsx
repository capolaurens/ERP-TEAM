import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { canAccessTeam, TEAM_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TaskBoard } from "../../tareas/task-board";
import { TaskCreateModal } from "../../tareas/task-create-modal";
import type { TaskCardData } from "../../tareas/task-card";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !canAccessTeam(user, project.team)) notFound();

  const [tasksRaw, members] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: id, status: { not: "DONE" } },
      include: { assignee: true, project: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { active: true, team: project.team },
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
      <Link
        href="/proyectos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a proyectos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1">
            <Badge className="bg-primary/10 text-primary">
              {TEAM_LABELS[project.team]}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <TaskCreateModal
          role={user.role}
          userTeam={user.team}
          projects={[]}
          members={members.map((m) => ({ id: m.id, name: m.name, team: m.team! }))}
          fixedTeam={project.team}
          fixedProjectId={project.id}
        />
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Este proyecto aún no tiene tareas. Crea la primera con «Nueva tarea».
        </div>
      ) : (
        <TaskBoard key={tasks.length} tasks={tasks} />
      )}
    </div>
  );
}
