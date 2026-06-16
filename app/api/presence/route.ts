import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ONLINE_WINDOW_MS = 60 * 1000; // online = visto en los últimos 60s

// Latido: marca al usuario actual como conectado.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });
  await prisma.user.updateMany({
    where: { id: session.user.id },
    data: { lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

// Lista de personas conectadas ahora mismo.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ online: [] }, { status: 401 });
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const online = await prisma.user.findMany({
    where: { active: true, lastSeenAt: { gte: since } },
    select: { id: true, name: true, role: true, team: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ online });
}
