"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { createProject } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { ALL_TEAMS, TEAM_LABELS } from "@/lib/rbac";
import type { Role, Team } from "@/generated/prisma/enums";

const initial: { error?: string; ok?: string } = {};

export function ProjectCreateForm({
  role,
}: {
  role: Role;
  team: Team | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createProject, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FolderPlus />
        Nuevo proyecto
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nuevo proyecto">
        <form ref={formRef} action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Nombre</Label>
            <Input id="p-name" name="name" required placeholder="Ej. Campaña de verano" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Descripción (opcional)</Label>
            <Textarea id="p-desc" name="description" placeholder="¿De qué trata este proyecto?" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-web">Web de la empresa</Label>
              <Input id="p-web" name="websiteUrl" type="url" placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-logo">Logo / foto (URL)</Label>
              <Input id="p-logo" name="logoUrl" type="url" placeholder="https://…/logo.png" />
            </div>
          </div>
          {role === "ADMIN" && (
            <div className="space-y-1.5">
              <Label htmlFor="p-team">Equipo</Label>
              <Select id="p-team" name="team" defaultValue="MARKETING">
                {ALL_TEAMS.map((t) => (
                  <option key={t} value={t}>
                    {TEAM_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear proyecto"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
