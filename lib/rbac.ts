import type { Role, Team } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  MARKETING: "Marketing",
  SALES: "Ventas",
  DESIGN: "Diseño / 3D",
  CLIENT: "Cliente",
};

export const TEAM_LABELS: Record<Team, string> = {
  MARKETING: "Marketing",
  SALES: "Ventas",
  DESIGN: "Diseño / 3D",
};

export const ALL_TEAMS: Team[] = ["MARKETING", "SALES", "DESIGN"];
export const ALL_ROLES: Role[] = ["ADMIN", "MARKETING", "SALES", "DESIGN", "CLIENT"];

/** Equipo "natural" asociado a un rol (Admin no pertenece a un equipo fijo). */
export function roleTeam(role: Role): Team | null {
  switch (role) {
    case "MARKETING":
      return "MARKETING";
    case "SALES":
      return "SALES";
    case "DESIGN":
      return "DESIGN";
    default:
      return null;
  }
}

type RbacUser = { role: Role; team?: Team | null };

export function isAdmin(user?: { role?: Role | null } | null): boolean {
  return user?.role === "ADMIN";
}

/** Equipos que un usuario puede ver. Admin ve todos. */
export function visibleTeams(user: RbacUser): Team[] {
  if (user.role === "ADMIN") return [...ALL_TEAMS];
  const t = user.team ?? roleTeam(user.role);
  return t ? [t] : [];
}

/** ¿Puede el usuario acceder a datos de este equipo? */
export function canAccessTeam(user: RbacUser, team: Team): boolean {
  return visibleTeams(user).includes(team);
}

/** Equipo por defecto al crear cosas (Admin elige; el resto, el suyo). */
export function defaultTeamFor(user: RbacUser): Team | null {
  if (user.role === "ADMIN") return null;
  return user.team ?? roleTeam(user.role);
}
