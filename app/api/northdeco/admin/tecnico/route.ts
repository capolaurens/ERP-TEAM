import { NextResponse } from "next/server";
import { guardiaAdmin, mensajeDeError } from "@/lib/northdeco-admin";
import { UMBRAL_PESO_BYTES } from "@/lib/northdeco-avisos";
import { leerCatalogoCompleto } from "@/lib/northdeco-catalogo";
import { datosTecnicosLote, type DatosTecnicos } from "@/lib/northdeco-tecnico";

/**
 * Ficha técnica de TODAS las piezas del catálogo: peso real, fecha, nombre del
 * archivo en Drive, geometría, generador y enlace.
 *
 * Los datos salen del archivo que la galería sirve DE VERDAD (el que resuelve
 * el resolver por nombre), no del driveId congelado del catálogo: si los dos no
 * coinciden, lo que importa es el que ve el cliente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ~23 s en frío para 50 piezas (3 llamadas a Drive cada una, pool de 8).
export const maxDuration = 300;

/** Una fila de la tabla: lo que sabe el catálogo + lo que sabe el archivo. */
type FilaTecnica = {
  file: string;
  fam: string;
  name: string;
  sku: string | null;
  publicada: boolean;
  /** Peso guardado en el catálogo, para poder compararlo con el real de Drive. */
  sizeBytesCatalogo: number | null;
  tecnico: DatosTecnicos;
};

export async function GET() {
  const veto = await guardiaAdmin();
  if (veto) return veto;

  try {
    // Completo (incluye las ocultas) a propósito: una pieza despublicada sigue
    // ocupando sitio en Drive y suele ser justo la que hay que revisar.
    const piezas = await leerCatalogoCompleto();
    const fichas = await datosTecnicosLote(piezas.map((p) => p.file));

    const filas: FilaTecnica[] = piezas.map((p) => ({
      file: p.file,
      fam: p.fam,
      name: p.name,
      sku: p.sku,
      publicada: p.publicada,
      sizeBytesCatalogo: p.sizeBytes,
      // datosTecnicosLote garantiza una entrada por clave pedida (las que
      // fallan traen `error` relleno), pero el ?? deja el tipo honesto.
      tecnico: fichas.get(p.file) ?? {
        clave: p.file,
        driveId: null,
        nombre: null,
        bytes: null,
        modificado: null,
        creado: null,
        enPapelera: null,
        md5: null,
        vertices: null,
        triangulos: null,
        mallas: null,
        primitivas: null,
        materiales: null,
        imagenes: null,
        generador: null,
        origen: "desconocido",
        comprimido: null,
        extensiones: [],
        enlace: null,
        error: "No se ha podido leer la ficha.",
      },
    }));

    return NextResponse.json({
      generadoEn: new Date().toISOString(),
      umbralPesoBytes: UMBRAL_PESO_BYTES,
      filas,
    });
  } catch (e) {
    console.error("northdeco admin tecnico:", e);
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
