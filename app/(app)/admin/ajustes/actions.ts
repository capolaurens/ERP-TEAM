"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ALL_TEAMS } from "@/lib/rbac";
import { setSetting, CALENDAR_ID_KEY } from "@/lib/settings";
import type { Team } from "@/generated/prisma/enums";

export async function updateTeamFolder(formData: FormData) {
  await requireAdmin();
  const team = String(formData.get("team") ?? "") as Team;
  const driveFolderId = String(formData.get("driveFolderId") ?? "").trim();
  if (!ALL_TEAMS.includes(team)) return;
  await prisma.teamDriveFolder.upsert({
    where: { team },
    update: { driveFolderId },
    create: { team, driveFolderId },
  });
  revalidatePath("/admin/ajustes");
}

export async function setCalendarId(formData: FormData) {
  await requireAdmin();
  const value = String(formData.get("calendarId") ?? "").trim();
  await setSetting(CALENDAR_ID_KEY, value);
  revalidatePath("/admin/ajustes");
}
