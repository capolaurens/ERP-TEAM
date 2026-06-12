import type { Role } from "@/generated/prisma/enums";
import { NavLinks } from "./nav";

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
          N
        </div>
        <span className="text-lg font-semibold">Navyx</span>
      </div>
      <NavLinks role={role} />
      <div className="px-5 py-4 text-xs text-sidebar-muted">ERP Navyx · v1</div>
    </aside>
  );
}
