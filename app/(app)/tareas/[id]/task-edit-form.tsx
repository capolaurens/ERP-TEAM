"use client";

import { updateTask } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  STATUS_ORDER,
  STATUS_LABELS,
  PRIORITY_ORDER,
  PRIORITY_LABELS,
} from "@/lib/tasks";
import type { Priority, TaskStatus } from "@/generated/prisma/enums";

type Opt = { id: string; name: string };

export function TaskEditForm({
  task,
  projects,
  members,
}: {
  task: {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: Priority;
    assigneeId: string;
    projectId: string;
    dueInput: string;
  };
  projects: Opt[];
  members: Opt[];
}) {
  return (
    <form action={updateTask} className="space-y-4">
      <input type="hidden" name="id" value={task.id} />
      <div className="space-y-1.5">
        <Label htmlFor="e-title">Título</Label>
        <Input id="e-title" name="title" defaultValue={task.title} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-desc">Descripción</Label>
        <Textarea
          id="e-desc"
          name="description"
          defaultValue={task.description}
          className="min-h-32"
          placeholder="Añade detalles, enlaces, checklist…"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="e-status">Estado</Label>
          <Select id="e-status" name="status" defaultValue={task.status}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-priority">Prioridad</Label>
          <Select id="e-priority" name="priority" defaultValue={task.priority}>
            {PRIORITY_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-assignee">Responsable</Label>
          <Select id="e-assignee" name="assigneeId" defaultValue={task.assigneeId}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-due">Fecha límite</Label>
          <Input id="e-due" type="date" name="dueDate" defaultValue={task.dueInput} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="e-project">Proyecto</Label>
          <Select id="e-project" name="projectId" defaultValue={task.projectId}>
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton>Guardar cambios</SubmitButton>
      </div>
    </form>
  );
}
