import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessTeam } from "@/lib/rbac";

export const runtime = "nodejs";

/**
 * Devuelve las fotos reales del producto de una pieza para compararlas con el
 * modelo 3D. La web del cliente (referenceUrl) no se puede meter en un iframe
 * (Shopify manda `X-Frame-Options: DENY`), así que sacamos las imágenes del
 * endpoint público `<origen>/products/<handle>.json` (Shopify, CORS abierto).
 *
 * Permisos: igual que el resto del portal — equipo de la tarea o cliente
 * vinculado al proyecto (o admin).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      team: true,
      referenceUrl: true,
      project: { select: { clientUsers: { select: { id: true } } } },
    },
  });
  if (!task) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const u = session.user;
  const clientLinked = task.project?.clientUsers.some((c) => c.id === u.id) ?? false;
  const allowed = canAccessTeam(u, task.team) || (u.role === "CLIENT" && clientLinked);
  if (!allowed) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const ref = task.referenceUrl?.trim();
  if (!ref) return NextResponse.json({ images: [], productUrl: null });

  // Extraer origen + handle de un enlace de producto Shopify: /products/<handle>
  let productUrl: string | null = ref;
  let jsonUrl: string | null = null;
  try {
    const url = new URL(ref);
    const m = url.pathname.match(/\/products\/([^/?#]+)/);
    if (m) jsonUrl = `${url.origin}/products/${m[1]}.json`;
  } catch {
    // ref no es una URL válida
  }
  if (!jsonUrl) return NextResponse.json({ images: [], productUrl });

  try {
    const res = await fetch(jsonUrl, {
      headers: { "User-Agent": "NavyxERP/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ images: [], productUrl });
    const data = (await res.json()) as {
      product?: { title?: string; images?: { src?: string }[] };
    };
    const images = (data.product?.images ?? [])
      .map((i) => i.src)
      .filter((s): s is string => !!s);
    return NextResponse.json({
      images,
      title: data.product?.title ?? null,
      productUrl,
    });
  } catch (err) {
    console.error(`[api/piece-photos/${taskId}]`, err);
    return NextResponse.json({ images: [], productUrl });
  }
}
