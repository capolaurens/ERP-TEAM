import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { canAccessTeam, TEAM_LABELS } from "@/lib/rbac";
import { STATUS_LABELS, PHASE_LABELS, PHASE_BADGE } from "@/lib/tasks";
import { formatRelative, toDateInput, formatBytes } from "@/lib/format";
import { nextThursdays } from "@/lib/dates";
import { isDriveConfigured } from "@/lib/drive";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ActivityType, TaskStatus } from "@/generated/prisma/enums";
import { TaskEditForm } from "./task-edit-form";
import { CommentForm } from "./comment-form";
import { DeleteTaskButton } from "./delete-task-button";
import { AttachmentUploader } from "./attachment-uploader";
import { deleteAttachment } from "./attachment-actions";
import { ModelPipeline } from "./model-pipeline";

function activityText(type: ActivityType, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (type) {
    case "CREATED":
      return "creó la tarea";
    case "STATUS_CHANGED":
      return `cambió el estado a «${STATUS_LABELS[m.to as TaskStatus] ?? m.to ?? ""}»`;
    case "ASSIGNED":
      return "cambió el responsable";
    case "DUE_CHANGED":
      return "cambió la fecha límite";
    case "COMMENTED":
      return "comentó";
    case "FILE_UPLOADED":
      return "subió un archivo";
    case "PHASE_CHANGED": {
      const on = m.to === "on";
      if (m.toggle === "mesh") return on ? "validó la malla ✓" : "quitó la validación de la malla";
      if (m.toggle === "texture") return on ? "validó la textura ✓" : "quitó la validación de la textura";
      if (m.toggle === "client") return on ? "marcó el OK del cliente ✓" : "quitó el OK del cliente";
      return "actualizó la validación";
    }
    default:
      return "actualizó la tarea";
  }
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAuth();

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: true,
      project: true,
      createdBy: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
      activities: {
        include: { actor: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      },
      modelImages: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task || !canAccessTeam(user, task.team)) notFound();

  const isAdmin = user.role === "ADMIN";
  const isDesign = task.team === "DESIGN";
  const thursdays = nextThursdays(12);
  const images = task.modelImages.map((im) => ({
    id: im.id,
    phase: im.phase,
    kind: im.kind,
    canDelete: im.uploadedById === user.id || isAdmin,
  }));

  const driveConfigured = isDriveConfigured();

  const [projects, members] = await Promise.all([
    prisma.project.findMany({
      where: { team: task.team, status: "active" },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true, team: task.team },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/tareas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a tareas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge className="bg-primary/10 text-primary">
              {TEAM_LABELS[task.team]}
            </Badge>
            {isDesign && (
              <Badge className={PHASE_BADGE[task.phase]}>
                {PHASE_LABELS[task.phase]}
              </Badge>
            )}
            {task.clientApprovedAt && (
              <Badge className="bg-green-100 text-green-700">Cliente ✓</Badge>
            )}
            {task.createdBy && <span>Creada por {task.createdBy.name}</span>}
          </div>
        </div>
        <DeleteTaskButton taskId={task.id} title={task.title} />
      </div>

      {isDesign && (
        <ModelPipeline
          taskId={task.id}
          phase={task.phase}
          changesRequested={task.changesRequested}
          meshApprovedAt={task.meshApprovedAt}
          textureApprovedAt={task.textureApprovedAt}
          clientApprovedAt={task.clientApprovedAt}
          referenceUrl={task.referenceUrl}
          images={images}
          isAdmin={isAdmin}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Detalles</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskEditForm
                task={{
                  id: task.id,
                  title: task.title,
                  description: task.description ?? "",
                  status: task.status,
                  priority: task.priority,
                  assigneeId: task.assigneeId ?? "",
                  projectId: task.projectId ?? "",
                  dueInput: toDateInput(task.dueDate),
                  referenceUrl: task.referenceUrl ?? "",
                }}
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                members={members.map((m) => ({ id: m.id, name: m.name }))}
                thursdays={thursdays}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comentarios ({task.comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {task.comments.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aún no hay comentarios. Sé el primero.
                </p>
              )}
              {task.comments.length > 0 && (
                <ul className="space-y-4">
                  {task.comments.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(c.author?.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">
                            {c.author?.name ?? "Usuario"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelative(c.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm">
                          {c.body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <CommentForm taskId={task.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actividad</CardTitle>
            </CardHeader>
            <CardContent>
              {task.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin actividad todavía.
                </p>
              ) : (
                <ul className="space-y-3">
                  {task.activities.map((a) => (
                    <li key={a.id} className="flex gap-2 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
                      <div>
                        <span className="font-medium">
                          {a.actor?.name ?? "Alguien"}
                        </span>{" "}
                        {activityText(a.type, a.meta)}
                        <div className="text-xs text-muted-foreground">
                          {formatRelative(a.createdAt)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Archivos ({task.attachments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {task.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay archivos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {task.attachments.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-2 rounded-lg border border-border p-2"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <a
                        href={f.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm hover:text-primary"
                        title={f.fileName}
                      >
                        {f.fileName}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                      <form action={deleteAttachment}>
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          className="shrink-0 text-muted-foreground transition hover:text-red-600"
                          title="Eliminar archivo"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <AttachmentUploader taskId={task.id} configured={driveConfigured} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
