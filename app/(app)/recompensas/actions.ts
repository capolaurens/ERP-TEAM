"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/session";
import type { RewardKind } from "@/generated/prisma/enums";

async function balanceOf(userId: string): Promise<number> {
  const agg = await prisma.pointsEntry.aggregate({
    where: { userId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

export async function createReward(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const cost = Math.max(1, parseInt(String(formData.get("costPoints") ?? "0"), 10) || 0);
  const kindRaw = String(formData.get("kind") ?? "OTHER");
  const kind: RewardKind = kindRaw === "GRADE" ? "GRADE" : kindRaw === "DAYS" ? "DAYS" : "OTHER";
  if (!title) return;
  await prisma.reward.create({ data: { title, description, costPoints: cost, kind } });
  revalidatePath("/recompensas");
}

export async function toggleReward(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const r = await prisma.reward.findUnique({ where: { id } });
  if (!r) return;
  await prisma.reward.update({ where: { id }, data: { active: !r.active } });
  revalidatePath("/recompensas");
}

export async function deleteReward(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await prisma.reward.deleteMany({ where: { id } });
  revalidatePath("/recompensas");
}

/** El admin da (o quita, con número negativo) puntos a una persona. */
export async function awardPoints(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const points = parseInt(String(formData.get("points") ?? "0"), 10) || 0;
  const reason = String(formData.get("reason") ?? "").trim() || "Puntos otorgados";
  if (!userId || points === 0) return;
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return;
  await prisma.pointsEntry.create({ data: { userId, points, reason } });
  revalidatePath("/recompensas");
}

/** Un usuario canjea una recompensa (descuenta puntos y deja la solicitud pendiente). */
export async function redeemReward(formData: FormData) {
  const user = await requireAuth();
  const rewardId = String(formData.get("rewardId") ?? "");
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) return;
  const bal = await balanceOf(user.id);
  if (bal < reward.costPoints) return;

  const redemption = await prisma.redemption.create({
    data: {
      userId: user.id,
      rewardId: reward.id,
      rewardTitle: reward.title,
      costPoints: reward.costPoints,
      status: "PENDING",
    },
  });
  await prisma.pointsEntry.create({
    data: {
      userId: user.id,
      points: -reward.costPoints,
      reason: `Canje: ${reward.title}`,
      redemptionId: redemption.id,
    },
  });
  revalidatePath("/recompensas");
}

/** El admin aprueba o rechaza un canje (al rechazar, devuelve los puntos). */
export async function decideRedemption(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const r = await prisma.redemption.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING") return;

  if (decision === "approve") {
    await prisma.redemption.update({
      where: { id },
      data: { status: "APPROVED", decidedAt: new Date(), decidedById: me.id },
    });
  } else if (decision === "reject") {
    await prisma.redemption.update({
      where: { id },
      data: { status: "REJECTED", decidedAt: new Date(), decidedById: me.id },
    });
    await prisma.pointsEntry.create({
      data: {
        userId: r.userId,
        points: r.costPoints,
        reason: `Devolución: ${r.rewardTitle}`,
        redemptionId: r.id,
      },
    });
  }
  revalidatePath("/recompensas");
}
