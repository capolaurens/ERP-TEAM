"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { toggleArchiveProject, deleteProject } from "./actions";
import { Badge } from "@/components/ui/badge";
import { TEAM_LABELS } from "@/lib/rbac";
import type { Team } from "@/generated/prisma/enums";

export function ProjectCard({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    team: Team;
    status: string;
    taskCount: number;
  };
}) {
  const archived = project.status === "archived";

  return (
    <div className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge className="bg-primary/10 text-primary">
          {TEAM_LABELS[project.team]}
        </Badge>
        {archived && (
          <Badge className="bg-slate-200 text-slate-600">Archivado</Badge>
        )}
      </div>
      <Link href={`/proyectos/${project.id}`} className="block flex-1">
        <h3 className="text-lg font-semibold transition group-hover:text-primary">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
      </Link>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {project.taskCount} tarea{project.taskCount === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          <form action={toggleArchiveProject}>
            <input type="hidden" name="id" value={project.id} />
            <button
              className="rounded p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={archived ? "Restaurar" : "Archivar"}
            >
              {archived ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
            </button>
          </form>
          <form
            action={deleteProject}
            onSubmit={(e) => {
              if (
                !confirm(
                  `¿Eliminar el proyecto «${project.name}»? Las tareas no se borran, quedan sin proyecto.`,
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={project.id} />
            <button
              className="rounded p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
              title="Eliminar proyecto"
            >
              <Trash2 className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
