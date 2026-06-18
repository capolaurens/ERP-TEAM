"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/rbac";

const initialState: { error?: string; ok?: string } = {};

export function UserCreateForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createUser, initialState);
  const [role, setRole] = useState("MARKETING");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRole("MARKETING");
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo usuario</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required placeholder="Nombre y apellido" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="correo@navyx.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="text" required placeholder="mín. 8 caracteres" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Rol</Label>
              <select
                id="role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={pending}>
              <UserPlus />
              {pending ? "Creando…" : "Crear"}
            </Button>
          </div>

          {role === "CLIENT" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <Label>Proyectos que podrá ver este cliente</Label>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay proyectos todavía. Crea uno primero en «Proyectos».
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="projectIds" value={p.id} className="size-4" />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state?.ok && <p className="text-sm text-green-600">{state.ok}</p>}
        </form>
      </CardContent>
    </Card>
  );
}
