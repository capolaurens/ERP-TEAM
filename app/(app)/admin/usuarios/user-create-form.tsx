"use client";

import { useActionState, useEffect, useRef } from "react";
import { UserPlus } from "lucide-react";
import { createUser } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_ROLES, ROLE_LABELS } from "@/lib/rbac";

const initialState: { error?: string; ok?: string } = {};

export function UserCreateForm() {
  const [state, action, pending] = useActionState(createUser, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nuevo usuario</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          action={action}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required placeholder="Nombre y apellido" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="correo@navyx.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="text"
              required
              placeholder="mín. 6 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              name="role"
              defaultValue="MARKETING"
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
        </form>
        {state?.error && (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        )}
        {state?.ok && <p className="mt-3 text-sm text-green-600">{state.ok}</p>}
      </CardContent>
    </Card>
  );
}
