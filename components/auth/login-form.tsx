"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { authenticate } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="tucorreo@navyx.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>
      {errorMessage && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        <LogIn />
        {isPending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
