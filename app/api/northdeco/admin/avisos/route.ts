import { NextRequest, NextResponse } from "next/server";
import { guardiaAdmin, mensajeDeError } from "@/lib/northdeco-admin";
import { auditarNorthdeco, UMBRAL_PESO_BYTES } from "@/lib/northdeco-avisos";
import { leerCatalogo } from "@/lib/northdeco-catalogo";

/**
 * Auditoría de la galería contra Drive: papelera, erratas de SKU, pesos,
 * geometría repetida y demás. Solo lectura.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// En frío son ~14 llamadas a Drive más ~50 lecturas de cabecera: ~25 s.
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const veto = await guardiaAdmin();
  if (veto) return veto;

  const params = req.nextUrl.searchParams;
  // Sin cabeceras baja de ~25 s a ~9 s, pero se pierden los avisos de geometría
  // duplicada y de malla sin texturizar (el peso se conserva: viene de Drive).
  const conCabeceras = params.get("cabeceras") !== "0";
  const refrescar = params.get("refrescar") === "1";

  try {
    // Se le INYECTA el catálogo de la BD en vez de dejar que lea el manifest.
    // Es el punto entero de este cableado: desde que el catálogo vive en
    // Postgres, auditar el JSON del repo sería auditar una lista que el cliente
    // ya no ve (y las piezas recién dadas de alta no saldrían nunca).
    //
    // Efecto secundario asumido: con catálogo inyectado el módulo no cachea el
    // informe. No importa tanto como parece — la foto de Drive (5 min) y las
    // cabeceras (indexadas por md5) sí siguen cacheadas, así que una segunda
    // pasada seguida es barata.
    const piezas = (await leerCatalogo()).map((p) => ({
      file: p.file,
      fam: p.fam,
      sku: p.sku,
      driveId: p.driveId,
      name: p.name,
    }));

    const informe = await auditarNorthdeco({ piezas, conCabeceras, refrescar });
    // El umbral viaja con el informe para que el panel no repita el número.
    return NextResponse.json({ ...informe, umbralPesoBytes: UMBRAL_PESO_BYTES });
  } catch (e) {
    // auditarNorthdeco promete no lanzar (los fallos salen como avisos), así
    // que llegar aquí significa que ha fallado la lectura del catálogo.
    console.error("northdeco admin avisos:", e);
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
