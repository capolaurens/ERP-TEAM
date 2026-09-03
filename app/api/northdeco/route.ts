import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clavesPublicadas } from "@/lib/northdeco-catalogo";
import { syncNorthdecoFolderBadge } from "@/lib/northdeco-badges";

/**
 * Emoji de estado (✅/🟡) en el nombre de la carpeta de Drive.
 * DESACTIVADO a petición del dueño (02-09-2026): las carpetas se quedan con su
 * nombre limpio "ND-XXXX". Para reactivarlo, poner BADGES_EN_DRIVE = true.
 */
const BADGES_EN_DRIVE = false;

async function badge(file: string) {
  if (!BADGES_EN_DRIVE) return;
  try {
    await syncNorthdecoFolderBadge(file);
  } catch (e) {
    console.error("northdeco badge sync:", e);
  }
}

// Feedback público de la galería /northdeco (check + comentarios). Va bajo /api,
// que el proxy de auth NO intercepta, así que es accesible sin login — cualquiera
// con el enlace puede dejar su valoración, como en un Google Sheets compartido.
export const runtime = "nodejs";

// Solo aceptamos claves que existan en el CATÁLOGO PUBLICADO (evita escrituras
// basura). Sale de lib/northdeco-catalogo.ts, NO de public/northdeco/manifest.json.
//
// Antes esto era un Set de módulo leído del JSON del repo una sola vez y sin
// caducidad. Desde que el catálogo vive en Postgres eso rechazaba con "Modelo no
// válido" justo las piezas dadas de alta desde /revision: el cliente las veía en
// la galería y podía girarlas, pero al dar el visto bueno o comentar recibía un
// 400 — el fallo más difícil de diagnosticar, porque la pieza estaba a la vista.
//
// `clavesPublicadas()` sale de la misma caché de 60 s que usan la galería y el
// proxy del GLB, y el alta la vacía, así que una pieza nueva acepta feedback al
// instante. Si Postgres falla, el catálogo cae solo al manifest y esta lista
// vuelve a ser exactamente la de antes: nunca se queda vacía rechazándolo todo.

export async function GET() {
  try {
    const [reviews, comments] = await Promise.all([
      prisma.northdecoReview.findMany({
        select: { file: true, checked: true, fixedAt: true },
      }),
      prisma.northdecoComment.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, file: true, author: true, text: true, createdAt: true },
      }),
    ]);
    const checks: Record<string, boolean> = {};
    const fixed: Record<string, string> = {};
    for (const r of reviews) {
      if (r.checked) checks[r.file] = true;
      if (r.fixedAt) fixed[r.file] = r.fixedAt.toISOString();
    }
    const byFile: Record<
      string,
      { id: string; author: string | null; text: string; createdAt: string }[]
    > = {};
    for (const c of comments) {
      (byFile[c.file] ||= []).push({
        id: c.id,
        author: c.author,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
      });
    }
    return NextResponse.json({ checks, fixed, comments: byFile });
  } catch (e) {
    console.error("northdeco feedback GET:", e);
    return NextResponse.json({ checks: {}, fixed: {}, comments: {} });
  }
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    file?: string;
    checked?: boolean;
    fixed?: boolean;
    text?: string;
    author?: string;
    id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const file = typeof body.file === "string" ? body.file : "";
  // `clavesPublicadas()` no lanza (el catálogo absorbe los fallos de BD cayendo
  // al manifest), así que puede ir fuera del try sin dejar la ruta sin red.
  if (!file || !(await clavesPublicadas()).has(file)) {
    return NextResponse.json({ error: "Modelo no válido" }, { status: 400 });
  }

  try {
    if (body.action === "check") {
      const checked = !!body.checked;
      await prisma.northdecoReview.upsert({
        where: { file },
        create: { file, checked },
        update: { checked },
      });
      await badge(file);
      return NextResponse.json({ ok: true, file, checked });
    }

    if (body.action === "fixed") {
      // Lo marca NAVYX cuando ha vuelto a subir la pieza tras un comentario.
      // Si el cliente comenta más tarde, la comparación de fechas la devuelve
      // sola a "por corregir" (no hace falta desmarcar a mano).
      const fixedAt = body.fixed === false ? null : new Date();
      await prisma.northdecoReview.upsert({
        where: { file },
        create: { file, checked: false, fixedAt },
        update: { fixedAt },
      });
      return NextResponse.json({ ok: true, file, fixedAt });
    }

    if (body.action === "comment") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const author =
        typeof body.author === "string" ? body.author.trim().slice(0, 80) : "";
      if (!text) {
        return NextResponse.json({ error: "Comentario vacío" }, { status: 400 });
      }
      if (text.length > 2000) {
        return NextResponse.json(
          { error: "Comentario demasiado largo (máx. 2000)" },
          { status: 400 },
        );
      }
      const c = await prisma.northdecoComment.create({
        data: { file, text, author: author || null },
      });
      await badge(file);
      return NextResponse.json({
        ok: true,
        comment: {
          id: c.id,
          author: c.author,
          text: c.text,
          createdAt: c.createdAt.toISOString(),
        },
      });
    }

    if (body.action === "deleteComment") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) {
        return NextResponse.json({ error: "Falta id" }, { status: 400 });
      }
      // Borrado abierto (como un Google Sheets compartido): cualquiera con el
      // enlace puede quitar un comentario. deleteMany = idempotente.
      await prisma.northdecoComment.deleteMany({ where: { id, file } });
      await badge(file);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    console.error("northdeco feedback POST:", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
