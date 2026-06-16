import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/login/actions";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";
import { MobileNav } from "./mobile-nav";
import { TopbarTimer } from "./topbar-timer";

export function Topbar({
  name,
  email,
  role,
  running,
}: {
  name: string;
  email: string;
  role: Role;
  running: { startedAt: string; taskTitle: string; taskId: string } | null;
}) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <MobileNav role={role} />
      <TopbarTimer running={running} />
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <Link
          href="/perfil"
          title={email}
          className="flex items-center gap-3 rounded-lg p-1 pr-2 transition hover:bg-muted"
        >
          <div className="text-right">
            <div className="text-sm font-medium leading-tight">{name}</div>
            <div className="text-xs leading-tight text-muted-foreground">
              {ROLE_LABELS[role]}
            </div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {name.charAt(0).toUpperCase()}
          </div>
        </Link>
        <form action={logout}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
