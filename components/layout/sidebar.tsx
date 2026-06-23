import type { Role } from "@/generated/prisma/enums";
import { NavLinks } from "./nav";

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-gradient-to-b from-[#1b1b1b] to-[#0e0e0e] text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/navyx_logo.avif" alt="Navyx" className="h-8 w-auto" />
      </div>
      <NavLinks role={role} />
      <div className="px-5 py-4 text-[11px] font-medium tracking-wide text-sidebar-muted">
        ERP Navyx · v1
      </div>
    </aside>
  );
}
