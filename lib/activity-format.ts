import { STATUS_LABELS } from "@/lib/tasks";
import type { ActivityType, TaskStatus } from "@/generated/prisma/enums";

export function activityLabel(type: ActivityType, meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  switch (type) {
    case "CREATED":
      return "creó la tarea";
    case "STATUS_CHANGED":
      return `cambió el estado a «${STATUS_LABELS[m.to as TaskStatus] ?? m.to ?? ""}»`;
    case "ASSIGNED":
      return "cambió el responsable";
    case "DUE_CHANGED":
      return "cambió la fecha límite";
    case "COMMENTED":
      return "comentó";
    case "FILE_UPLOADED":
      return "subió un archivo";
    default:
      return "hizo un cambio";
  }
}
