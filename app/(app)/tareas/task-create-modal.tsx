"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "./actions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALL_TEAMS, TEAM_LABELS } from "@/lib/rbac";
import { PRIORITY_ORDER, PRIORITY_LABELS } from "@/lib/tasks";
import { nextThursdays } from "@/lib/dates";
import type { Role, Team } from "@/generated/prisma/enums";

type Opt = { id: string; name: string; team: Team };

export function TaskCreateModal({
  role,
  userTeam,
  projects,
  members,
  fixedTeam,
  fixedProjectId,
  label = "Nueva tarea",
}: {
  role: Role;
  userTeam: Team | null;
  projects: Opt[];
  members: Opt[];
  fixedTeam?: Team;
  fixedProjectId?: string;
  label?: string;
}) {
  const isAdmin = role === "ADMIN";
  const initialTeam = fixedTeam ?? userTeam ?? "MARKETING";
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<Team>(initialTeam);
  const [thursdays, setThursdays] = useState<{ value: string; label: string }[]>([]);
  const [state, action, pending] = useActionState(createTask, {} as {
    error?: string;
    ok?: string;
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setThursdays(nextThursdays(12));
  }, []);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  const teamProjects = useMemo(
    () => projects.filter((p) => p.team === team),
    [projects, team],
  );
  const teamMembers = useMemo(
    () => members.filter((m) => m.team === team),
    [members, team],
  );
  const showTeamSelect = isAdmin && !fixedTeam;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva tarea">
        <form ref={formRef} action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Título</Label>
            <Input id="t-title" name="title" required placeholder="¿Qué hay que hacer?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Descripción (opcional)</Label>
            <Textarea id="t-desc" name="description" />
          </div>

          {showTeamSelect ? (
            <div className="space-y-1.5">
              <Label htmlFor="t-team">Equipo</Label>
              <Select
                id="t-team"
                name="team"
                value={team}
                onChange={(e) => setTeam(e.target.value as Team)}
              >
                {ALL_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {TEAM_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <input type="hidden" name="team" value={team} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-priority">Prioridad</Label>
              <Select id="t-priority" name="priority" defaultValue="MEDIUM">
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">Entrega (jueves)</Label>
              <Select id="t-due" name="dueDate" defaultValue="">
                <option value="">Sin fecha</option>
                {thursdays.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">Responsable</Label>
              <Select id="t-assignee" name="assigneeId" defaultValue="">
                <option value="">Sin asignar</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-project">Proyecto</Label>
              {fixedProjectId ? (
                <>
                  <input type="hidden" name="projectId" value={fixedProjectId} />
                  <Input value="Este proyecto" disabled />
                </>
              ) : (
                <Select id="t-project" name="projectId" defaultValue="">
                  <option value="">Sin proyecto</option>
                  {teamProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear tarea"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
