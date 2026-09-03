import { NextResponse } from "next/server";
import { invalidarCachesGaleria } from "@/lib/northdeco-admin";

/**
 * Vacía las cachés que alimentan la GALERÍA: qué archivo de Drive sirve cada
 * pieza y el catálogo. Lo llama el botón "Actualizar desde Drive" de
 * /northdeco, para ver al instante un GLB recién subido sin esperar a que
 * caduque la caché.
 *
 * Sigue siendo PÚBLICO, como el resto de /api/northdeco: la galería la usa el
 * cliente sin login. No expone nada (responde {ok:true}).
 *
 * A PROPÓSITO no vacía las cachés del panel de admin (escaneo, avisos, fichas
 * técnicas) aunque estén en el mismo módulo: ver `invalidarCachesGaleria()` en
 * lib/northdeco-admin.ts. Resumen: esas cuestan hasta 25 s de lecturas a Drive
 * y no pueden quedar a tiro de un POST anónimo repetido.
 */
export const runtime = "nodejs";

export async function POST() {
  invalidarCachesGaleria();
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
