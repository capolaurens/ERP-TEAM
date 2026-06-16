import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ONLINE_WINDOW_MS = 60 * 1000; // online = visto en los últimos 60s
const SESSION_GAP_MS = 2 * 60 * 1000; // hueco que parte una sesión de trabajo

// Latido: marca al usuario actual como conectado y mantiene su sesión de trabajo.
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ ok: false }, { status: 401 });
  const userId = session.user.id;
  const now = new Date();

  // Marca presencia (updateMany evita lanzar si el usuario fue borrado/inactivo).
  const res = await prisma.user.updateMany({
    where: { id: userId, active: true },
    data: { lastSeenAt: now },
  });
  if (res.count === 0) return NextResponse.json({ ok: true });

  // Sesión de trabajo (asistencia): si el último latido fue hace poco, se
  // prolonga la sesión abierta; si no, se cierra la anterior y se abre otra.
  const open = await prisma.workSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (open && now.getTime() - open.lastSeenAt.getTime() <= SESSION_GAP_MS) {
    await prisma.workSession.update({
      where: { id: open.id },
      data: { lastSeenAt: now },
    });
  } else {
    if (open) {
      await prisma.workSession.update({
        where: { id: open.id },
        data: { endedAt: open.lastSeenAt },
      });
    }
    await prisma.workSession.create({
      data: { userId, startedAt: now, lastSeenAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}

// Lista de personas conectadas ahora mismo.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ online: [] }, { status: 401 });
  const since = new Date(Date.now() - ONLINE_WINDOW_MS);
  const online = await prisma.user.findMany({
    where: { active: true, lastSeenAt: { gte: since } },
    select: { id: true, name: true, role: true, team: true, avatarSeed: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ online });
}
