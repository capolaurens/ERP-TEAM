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
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  roles?: Role[];
};

export const NAV: NavItem[] = [
  { href: "/", label: "Panel", icon: LayoutDashboard },
  { href: "/tareas", label: "Tareas", icon: CheckSquare },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanban },
  { href: "/calendario", label: "Calendario", icon: Calendar },
  { href: "/revision", label: "Revisión", icon: ClipboardCheck, adminOnly: true },
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
  const items = NAV.filter((item) => {
    if (item.adminOnly) return role === "ADMIN";
    if (item.roles) return item.roles.includes(role);
    return true;
  });

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
              "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
              active
                ? "bg-white/[0.08] text-white"
                : "text-sidebar-muted hover:bg-white/[0.05] hover:text-white",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-gradient-brand" />
            )}
            <Icon
              className={cn(
                "size-4 transition-colors",
                active ? "text-primary" : "text-sidebar-muted group-hover:text-white",
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
