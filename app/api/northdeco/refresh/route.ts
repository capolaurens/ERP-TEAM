import { NextResponse } from "next/server";
import { invalidar } from "@/lib/northdeco-resolver";

/**
 * Vacía la caché que empareja cada pieza con su archivo de Drive.
 * Lo llama el botón "Actualizar desde Drive" de la galería, para ver al
 * instante un GLB recién subido sin esperar a que caduque la caché.
 */
export const runtime = "nodejs";

export async function POST() {
  invalidar();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
