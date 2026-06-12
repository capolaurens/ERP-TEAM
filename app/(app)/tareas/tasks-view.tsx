"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Table as TableIcon } from "lucide-react";
import { TaskBoard } from "./task-board";
import { TaskTable } from "./task-table";
import { TaskCreateModal } from "./task-create-modal";
import type { TaskCardData } from "./task-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Role, Team } from "@/generated/prisma/enums";

type Opt = { id: string; name: string; team: Team };

export function TasksView({
  tasks,
  projects,
  members,
  role,
  userTeam,
}: {
  tasks: TaskCardData[];
  projects: Opt[];
  members: Opt[];
  role: Role;
  userTeam: Team | null;
}) {
  const [view, setView] = useState<"board" | "table">("board");
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!q || t.title.toLowerCase().includes(q.toLowerCase())) &&
          (!projectId || t.projectId === projectId) &&
          (!assigneeId || t.assigneeId === assigneeId),
      ),
    [tasks, q, projectId, assigneeId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          <button
            onClick={() => setView("board")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
              view === "board"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
            Tablero
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
              view === "table"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <TableIcon className="size-4" />
            Tabla
          </button>
        </div>

        <Input
          placeholder="Buscar tarea…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-44"
        />
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="h-9 w-44"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="h-9 w-40"
        >
          <option value="">Cualquiera</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>

        <div className="ml-auto">
          <TaskCreateModal
            role={role}
            userTeam={userTeam}
            projects={projects}
            members={members}
          />
        </div>
      </div>

      {view === "board" ? (
        <TaskBoard
          key={`${q}|${projectId}|${assigneeId}|${filtered.length}`}
          tasks={filtered}
        />
      ) : (
        <TaskTable tasks={filtered} />
      )}
    </div>
  );
}
