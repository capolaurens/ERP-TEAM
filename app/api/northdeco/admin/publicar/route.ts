import { NextRequest, NextResponse } from "next/server";
import {
  guardiaAdmin,
  invalidarCachesNorthdeco,
  mensajeDeError,
} from "@/lib/northdeco-admin";
import { escanearDrive, publicarPiezas } from "@/lib/northdeco-escaneo";

/**
 * Da de alta en el catálogo de la BD las piezas elegidas en el escaneo.
 * Es el único endpoint de Northdeco que ESCRIBE en el catálogo, de ahí que sea
 * POST y que compruebe la sesión de admin antes que nada (/api no pasa por el
 * proxy de auth).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Tope de piezas por llamada. No es una limitación técnica: es para que un
 * "seleccionar todo" con el alcance «todo» (264 candidatas, casi todas familias
 * que nadie ha revisado) no publique medio Drive de un clic.
 */
const MAX_CLAVES = 200;

export async function POST(req: NextRequest) {
  const veto = await guardiaAdmin();
  if (veto) return veto;

  let cuerpo: { claves?: unknown };
  try {
    cuerpo = (await req.json()) as { claves?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const claves = Array.isArray(cuerpo.claves)
    ? cuerpo.claves.filter((c): c is string => typeof c === "string" && c.length > 0)
    : [];

  if (!claves.length) {
    return NextResponse.json(
      { error: "No se ha indicado ninguna pieza (falta `claves`)." },
      { status: 400 },
    );
  }
  if (claves.length > MAX_CLAVES) {
    return NextResponse.json(
      { error: `Demasiadas piezas de golpe (máx. ${MAX_CLAVES}).` },
      { status: 400 },
    );
  }

  try {
    // publicarPiezas() valida las claves contra `escanearDrive()` SIN opciones,
    // o sea contra el alcance "todo" y aceptando su caché de 5 min. Dos motivos
    // para refrescarla antes a mano:
    //
    //  - El panel escanea por defecto solo las familias publicadas, que es otro
    //    alcance y otra caché.
    //  - Si alguien hizo un barrido completo hace cuatro minutos y el GLB se ha
    //    subido después, la caché vieja no lo tiene y el alta contestaría
    //    "ya no está en Drive" sobre un archivo que sí está.
    //
    // Cuesta ~6 s (5 llamadas a Drive) una vez por alta. Barato para lo raro que
    // es publicar y para lo confuso que resulta el fallo contrario.
    await escanearDrive({ alcance: "todo", forzar: true });

    const resultado = await publicarPiezas(claves);

    // publicarPiezas ya vacía catálogo y escaneo, pero no el resolver, los
    // avisos ni las fichas técnicas. Si se dejan a medias, el panel enseña una
    // foto de dos épocas: la pieza ya está en el catálogo y el aviso sigue
    // diciendo que está "sin publicar".
    // La galería se renderiza en cada visita (force-dynamic) leyendo esa misma
    // caché, así que vaciarla aquí es lo que hace que la pieza salga al
    // instante en /northdeco sin desplegar nada.
    invalidarCachesNorthdeco();

    return NextResponse.json(resultado);
  } catch (e) {
    // El fallo esperable aquí es la guarda del módulo: publicarPiezas se niega
    // a crear la primera fila si el catálogo se está sirviendo del manifest
    // (crearla dejaría la galería en UNA pieza en vez de 50). Ese mensaje es
    // útil tal cual, así que se devuelve al panel.
    console.error("northdeco admin publicar:", e);
    return NextResponse.json({ error: mensajeDeError(e) }, { status: 500 });
  }
}
