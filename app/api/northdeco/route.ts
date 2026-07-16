import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

// Feedback público de la galería /northdeco (check + comentarios). Va bajo /api,
// que el proxy de auth NO intercepta, así que es accesible sin login — cualquiera
// con el enlace puede dejar su valoración, como en un Google Sheets compartido.
export const runtime = "nodejs";

// Solo aceptamos ficheros que existan en el manifest (evita escrituras basura).
let VALID: Set<string> | null = null;
function validFiles(): Set<string> {
  if (VALID) return VALID;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "public/northdeco/manifest.json"),
      "utf8",
    );
    VALID = new Set((JSON.parse(raw) as { file: string }[]).map((m) => m.file));
  } catch {
    VALID = new Set();
  }
  return VALID;
}

export async function GET() {
  try {
    const [reviews, comments] = await Promise.all([
      prisma.northdecoReview.findMany({
        where: { checked: true },
        select: { file: true },
      }),
      prisma.northdecoComment.findMany({
        orderBy: { createdAt: "asc" },
        select: { file: true, author: true, text: true, createdAt: true },
      }),
    ]);
    const checks: Record<string, boolean> = {};
    for (const r of reviews) checks[r.file] = true;
    const byFile: Record<
      string,
      { author: string | null; text: string; createdAt: string }[]
    > = {};
    for (const c of comments) {
      (byFile[c.file] ||= []).push({
        author: c.author,
        text: c.text,
        createdAt: c.createdAt.toISOString(),
      });
    }
    return NextResponse.json({ checks, comments: byFile });
  } catch (e) {
    console.error("northdeco feedback GET:", e);
    return NextResponse.json({ checks: {}, comments: {} });
  }
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    file?: string;
    checked?: boolean;
    text?: string;
    author?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const file = typeof body.file === "string" ? body.file : "";
  if (!file || !validFiles().has(file)) {
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
      return NextResponse.json({ ok: true, file, checked });
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
      return NextResponse.json({
        ok: true,
        comment: {
          author: c.author,
          text: c.text,
          createdAt: c.createdAt.toISOString(),
        },
      });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    console.error("northdeco feedback POST:", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
