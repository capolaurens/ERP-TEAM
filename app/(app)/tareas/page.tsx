import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { TasksView } from "./tasks-view";
import type { TaskCardData } from "./task-card";
import { PipelineView } from "./pipeline-view";
import type { PipelinePiece } from "./pipeline-board";

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

  // Los DISEÑADORES (chicos de prácticas 3D) usan el tablero de PIPELINE por
  // fases; el resto de equipos, el tablero normal por estado.
  if (user.role === "DESIGN") {
    const pieces: PipelinePiece[] = tasksRaw.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      meshSubmitted: !!t.meshSubmittedAt,
      meshApproved: !!t.meshApprovedAt,
      clientMesh: !!t.clientMeshAt,
      textureSubmitted: !!t.textureSubmittedAt,
      textureApproved: !!t.textureApprovedAt,
      clientTexture: !!t.clientTextureAt,
    }));
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Tareas</h1>
          <p className="max-w-3xl text-muted-foreground">
            Tu pipeline de piezas 3D. Haz la <strong>malla</strong> y arrástrala a{" "}
            <strong>Malla terminada</strong>; cuando el cliente la apruebe, la
            pieza vuelve a <strong>Para textura</strong>. Termina la textura y
            arrástrala a <strong>Textura añadida</strong>.
          </p>
        </div>
        <PipelineView
          pieces={pieces}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        />
      </div>
    );
  }

  const now = Date.now();
  const all: TaskCardData[] = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    team: t.team,
    phase: t.phase,
    clientApproved: !!t.clientApprovedAt,
    dueDate: t.dueDate ? formatDate(t.dueDate) : null,
    overdue: !!t.dueDate && t.status !== "DONE" && t.dueDate.getTime() < now,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
  }));

  // Las tareas "Hecho" se consideran completadas/archivadas: fuera del tablero activo.
  const tasks = all.filter((t) => t.status !== "DONE");
  const completed = all.filter((t) => t.status === "DONE");

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
        completed={completed}
        projects={projects.map((p) => ({ id: p.id, name: p.name, team: p.team }))}
        members={members.map((m) => ({ id: m.id, name: m.name, team: m.team! }))}
        role={user.role}
        userTeam={user.team}
      />
    </div>
  );
}
