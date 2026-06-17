import type { TaskStatus, Priority, ModelPhase } from "@/generated/prisma/enums";

export const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En progreso",
  DONE: "Hecho",
};

export const STATUS_BADGE: Record<TaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  DONE: "bg-green-500",
};

export const PRIORITY_ORDER: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const PRIORITY_BADGE: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

// Fases del pipeline de validación 3D
export const PHASE_ORDER: ModelPhase[] = ["MESH", "TEXTURE", "DONE"];

export const PHASE_LABELS: Record<ModelPhase, string> = {
  MESH: "Malla",
  TEXTURE: "Textura",
  DONE: "Completada",
};

export const PHASE_BADGE: Record<ModelPhase, string> = {
  MESH: "bg-indigo-100 text-indigo-700",
  TEXTURE: "bg-fuchsia-100 text-fuchsia-700",
  DONE: "bg-green-100 text-green-700",
};
