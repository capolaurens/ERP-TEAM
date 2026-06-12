"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  FolderKanban,
  Calendar,
  Users,
  Settings,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Panel", icon: LayoutDashboard, adminOnly: false },
  { href: "/tareas", label: "Tareas", icon: CheckSquare, adminOnly: false },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban, adminOnly: false },
  { href: "/calendario", label: "Calendario", icon: Calendar, adminOnly: false },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users, adminOnly: true },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings, adminOnly: true },
];

export function NavLinks({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.adminOnly || role === "ADMIN");

  return (
    <nav className="flex-1 space-y-1 px-3 py-2">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-active text-white"
                : "text-sidebar-muted hover:bg-sidebar-active hover:text-white",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
