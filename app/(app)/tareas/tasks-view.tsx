"use client";

import { useMemo, useState, type ReactNode } from "react";
import { LayoutGrid, Table as TableIcon, CheckCircle2 } from "lucide-react";
import { TaskBoard } from "./task-board";
import { TaskTable } from "./task-table";
import { TaskCreateModal } from "./task-create-modal";
import type { TaskCardData } from "./task-card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Role, Team } from "@/generated/prisma/enums";

type Opt = { id: string; name: string; team: Team };
type View = "board" | "table" | "completed";

export function TasksView({
  tasks,
  completed,
  projects,
  members,
  role,
  userTeam,
}: {
  tasks: TaskCardData[];
  completed: TaskCardData[];
  projects: Opt[];
  members: Opt[];
  role: Role;
  userTeam: Team | null;
}) {
  const [view, setView] = useState<View>("board");
  const [q, setQ] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const applyFilters = (list: TaskCardData[]) =>
    list.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q.toLowerCase())) &&
        (!projectId || t.projectId === projectId) &&
        (!assigneeId || t.assigneeId === assigneeId),
    );

  const filtered = useMemo(
    () => applyFilters(tasks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, q, projectId, assigneeId],
  );
  const filteredCompleted = useMemo(
    () => applyFilters(completed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completed, q, projectId, assigneeId],
  );

  const tab = (key: View, icon: ReactNode, label: string, count?: number) => (
    <button
      onClick={() => setView(key)}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
        view === key
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-xs",
            view === key ? "bg-white/20" : "bg-muted",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          {tab("board", <LayoutGrid className="size-4" />, "Tablero")}
          {tab("table", <TableIcon className="size-4" />, "Tabla")}
          {tab("completed", <CheckCircle2 className="size-4" />, "Completadas", completed.length)}
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

      {view === "board" && (
        <TaskBoard
          key={`${q}|${projectId}|${assigneeId}|${filtered.length}`}
          tasks={filtered}
        />
      )}
      {view === "table" && <TaskTable tasks={filtered} />}
      {view === "completed" && (
        <>
          {filteredCompleted.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Aún no hay tareas completadas. Las que marques como «Hecho»
              aparecerán aquí.
            </div>
          ) : (
            <TaskTable tasks={filteredCompleted} />
          )}
        </>
      )}
    </div>
  );
}
