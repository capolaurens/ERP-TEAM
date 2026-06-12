"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { editUser } from "./actions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UserEditModal({
  user,
}: {
  user: { id: string; name: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(editUser, {} as {
    error?: string;
    ok?: string;
  });

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Editar / restablecer contraseña"
        className="text-muted-foreground transition hover:text-foreground"
      >
        <Pencil className="size-4" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Editar a ${user.name}`}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />
          <div className="space-y-1.5">
            <Label htmlFor={`edit-name-${user.id}`}>Nombre</Label>
            <Input
              id={`edit-name-${user.id}`}
              name="name"
              defaultValue={user.name}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-email-${user.id}`}>Email</Label>
            <Input
              id={`edit-email-${user.id}`}
              name="email"
              type="email"
              defaultValue={user.email}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-pass-${user.id}`}>
              Nueva contraseña (opcional)
            </Label>
            <Input
              id={`edit-pass-${user.id}`}
              name="newPassword"
              type="text"
              placeholder="Déjalo vacío para no cambiarla"
            />
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
