"use client";

import { Trash2 } from "lucide-react";
import { updateRole, toggleActive, deleteUser } from "./actions";
import { UserEditModal } from "./user-edit-modal";
import { Badge } from "@/components/ui/badge";
import { ALL_ROLES, ROLE_LABELS, TEAM_LABELS, roleTeam } from "@/lib/rbac";
import type { Role, Team } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type RowUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  team: Team | null;
  active: boolean;
  projectIds: string[];
};

export function UserRow({
  user,
  isSelf,
  projects,
}: {
  user: RowUser;
  isSelf: boolean;
  projects: { id: string; name: string }[];
}) {
  const team = user.team ?? roleTeam(user.role);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">
          {user.name}
          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(tú)</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
      <td className="px-4 py-3">
        <form action={updateRole}>
          <input type="hidden" name="id" value={user.id} />
          <select
            name="role"
            defaultValue={user.role}
            disabled={isSelf}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm disabled:opacity-60"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </form>
      </td>
      <td className="px-4 py-3 text-sm">{team ? TEAM_LABELS[team] : "—"}</td>
      <td className="px-4 py-3">
        <form action={toggleActive}>
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="active" value={(!user.active).toString()} />
          <button type="submit" disabled={isSelf} title="Cambiar estado">
            <Badge
              className={cn(
                "cursor-pointer",
                user.active
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-200 text-slate-600",
                isSelf && "cursor-default opacity-70",
              )}
            >
              {user.active ? "Activo" : "Inactivo"}
            </Badge>
          </button>
        </form>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          <UserEditModal
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              projectIds: user.projectIds,
            }}
            projects={projects}
          />
          {!isSelf && (
            <form
              action={deleteUser}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `¿Eliminar a ${user.name}? Esta acción no se puede deshacer.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={user.id} />
              <button
                type="submit"
                title="Eliminar usuario"
                className="text-muted-foreground transition-colors hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          )}
        </div>
      </td>
    </tr>
  );
}
