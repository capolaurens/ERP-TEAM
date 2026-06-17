import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse("No autorizado", { status: 401 });
  const { id } = await ctx.params;

  const img = await prisma.modelImage.findUnique({
    where: { id },
    include: { task: { select: { team: true } } },
  });
  if (!img) return new NextResponse("No encontrado", { status: 404 });
  if (!canAccessTeam(session.user, img.task.team)) {
    return new NextResponse("Sin acceso", { status: 403 });
  }

  const body = new Uint8Array(img.data);
  return new NextResponse(body, {
    headers: {
      "Content-Type": img.mimeType || "image/png",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(body.byteLength),
    },
  });
}
