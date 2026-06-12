import { prisma } from "@/lib/prisma";
import type { ActivityType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export async function logActivity(params: {
  type: ActivityType;
  actorId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  await prisma.activity.create({
    data: {
      type: params.type,
      actorId: params.actorId ?? null,
      taskId: params.taskId ?? null,
      projectId: params.projectId ?? null,
      meta: params.meta,
    },
  });
}
