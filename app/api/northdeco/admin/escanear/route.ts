import { NextRequest, NextResponse } from "next/server";
import { guardiaAdmin, mensajeDeError } from "@/lib/northdeco-admin";
import {
  escanearDrive,
  escaneoDisponible,
  type Alcance,
} from "@/lib/northdeco-escaneo";

/**
 * Qué hay en Drive que la galería todavía no enseña, y qué ficha de la galería
 * se ha quedado sin archivo. SOLO LEE: no toca ni Drive ni el catálogo.
 *
 * Va bajo /api, que el proxy NO protege (está excluido del matcher para que el
 * feedback público funcione sin login), así que la sesión se comprueba aquí
 * mismo. No es paranoia: la respuesta lleva ids de Drive, nombres internos de
 * archivo y el árbol de carpetas del cliente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// El barrido completo son 5 llamadas a Drive (~6 s), pero Drive tiene días malos.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const veto = await guardiaAdmin();
  if (veto) return veto;

  // Sin credenciales de Drive el escaneo lanza. Mejor un 503 con explicación
  // que un 500 genérico: el panel puede pintarse en gris y decir por qué.
  if (!escaneoDisponible()) {
    return NextResponse.json(
      {
        error:
          "Google Drive no está configurado en este entorno (falta GOOGLE_SERVICE_ACCOUNT_JSON).",
      },
      { status: 503 },
    );
  }

  const params = req.nextUrl.searchParams;
  // Por defecto "publicadas" (2 llamadas, ~2 s), NO el "todo" que trae el
  // módulo: el barrido completo devuelve 264 candidatas —las ~170 familias que
  // nunca han entrado en la galería— y ahogaría las 3 que de verdad importan.
  const alcance: Alcance = params.get("alcance") === "todo" ? "todo" : "publicadas";
  const forzar = params.get("forzar") === "1";

  try {
    const informe = await escanearDrive({ alcance, forzar });
    return NextResponse.json(informe);
  } catch (e) {
    console.error("northdeco admin escanear:", e);
    // 502: el fallo es de Drive, no de quien llama.
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 502 });
  }
}
