"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { updateProject } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";

const initial: { error?: string; ok?: string } = {};

export function ProjectEditForm({
  project,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updateProject, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Editar
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar proyecto">
        <form ref={formRef} action={action} className="space-y-4">
          <input type="hidden" name="id" value={project.id} />
          <div className="space-y-1.5">
            <Label htmlFor="pe-name">Nombre</Label>
            <Input id="pe-name" name="name" defaultValue={project.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe-desc">Descripción</Label>
            <Textarea id="pe-desc" name="description" defaultValue={project.description ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe-web">Web de la empresa</Label>
            <Input id="pe-web" name="websiteUrl" type="url" defaultValue={project.websiteUrl ?? ""} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pe-logo">Logo / foto (URL)</Label>
            <Input id="pe-logo" name="logoUrl" type="url" defaultValue={project.logoUrl ?? ""} placeholder="https://…/logo.png" />
            <p className="text-xs text-muted-foreground">
              Pega la dirección de la imagen del logo (clic derecho → copiar dirección de la imagen).
            </p>
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
