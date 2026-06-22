import type { RewardKind, RedemptionStatus } from "@/generated/prisma/enums";

export const REWARD_KINDS: RewardKind[] = ["GRADE", "DAYS", "OTHER"];

export const REWARD_KIND_LABELS: Record<RewardKind, string> = {
  GRADE: "Nota más alta",
  DAYS: "Ahorro de días",
  OTHER: "Otro",
};

export const REWARD_KIND_BADGE: Record<RewardKind, string> = {
  GRADE: "bg-violet-100 text-violet-700",
  DAYS: "bg-teal-100 text-teal-700",
  OTHER: "bg-slate-100 text-slate-600",
};

export const REDEMPTION_STATUS_LABELS: Record<RedemptionStatus, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export const REDEMPTION_STATUS_BADGE: Record<RedemptionStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};
