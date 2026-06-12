"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { NavLinks } from "./nav";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        title="Menú"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <div className="flex h-16 items-center justify-between px-5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
                  N
                </div>
                <span className="text-lg font-semibold">Navyx</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-sidebar-muted hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavLinks role={role} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
