import { prisma } from "@/lib/prisma";
import type { Team } from "@/generated/prisma/enums";

const ENV_FOLDERS: Record<Team, string | undefined> = {
  MARKETING: process.env.DRIVE_FOLDER_MARKETING,
  SALES: process.env.DRIVE_FOLDER_SALES,
  DESIGN: process.env.DRIVE_FOLDER_DESIGN,
};

/**
 * Carpeta de Drive donde se suben los archivos de un equipo.
 * Prioriza lo configurado por el admin (tabla TeamDriveFolder) y cae a las
 * variables de entorno DRIVE_FOLDER_* como respaldo.
 */
export async function getTeamFolderId(team: Team): Promise<string | null> {
  const row = await prisma.teamDriveFolder.findUnique({ where: { team } });
  if (row?.driveFolderId && row.driveFolderId.trim()) return row.driveFolderId.trim();
  return ENV_FOLDERS[team]?.trim() || null;
}
