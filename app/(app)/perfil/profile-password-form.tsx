"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeOwnPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfilePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, {} as {
    error?: string;
    ok?: string;
  });
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">Contraseña actual</Label>
        <Input id="current" name="current" type="password" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="next">Nueva contraseña</Label>
        <Input
          id="next"
          name="next"
          type="password"
          required
          placeholder="mín. 6 caracteres"
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-600">{state.ok}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
