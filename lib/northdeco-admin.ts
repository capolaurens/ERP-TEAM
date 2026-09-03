import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { invalidar } from "@/lib/northdeco-resolver";
import { invalidarCatalogo } from "@/lib/northdeco-catalogo";
import { invalidarEscaneo } from "@/lib/northdeco-escaneo";
import { invalidarAvisos } from "@/lib/northdeco-avisos";
import { invalidarTecnico } from "@/lib/northdeco-tecnico";

/**
 * Cosas comunes a los endpoints de ADMINISTRACIÓN de Northdeco
 * (app/api/northdeco/admin/*).
 *
 * Existe por dos motivos, los dos de los que se olvida uno al añadir el quinto
 * endpoint:
 *
 * 1. PROTECCIÓN. proxy.ts excluye /api del matcher a propósito, para que el
 *    feedback público de la galería funcione sin login. Es decir: NADA bajo
 *    /api está protegido por el proxy. Estos endpoints enseñan ids de Drive,
 *    la estructura de carpetas del cliente y los nombres internos de archivo,
 *    así que cada handler tiene que comprobar la sesión ÉL MISMO. No vale
 *    requireAdmin(): hace redirect(), que en un handler JSON devuelve un 307 a
 *    /login en vez de un error que el panel pueda enseñar.
 *
 * 2. INVALIDACIÓN. Hay CINCO cachés en marcha (resolver, catálogo, escaneo,
 *    avisos y datos técnicos) con TTL distintos. Si un alta vacía unas y otras
 *    no, el panel enseña una foto de dos épocas: la pieza ya existe en el
 *    catálogo pero el escaneo la sigue dando como "sin publicar". Se vacían
 *    todas juntas o ninguna.
 */

/**
 * Comprueba que quien llama es un ADMIN con sesión.
 * Devuelve la respuesta de error si NO lo es, o `null` si puede pasar.
 *
 *   const veto = await guardiaAdmin();
 *   if (veto) return veto;
 *
 * 401 = no hay sesión (hay que iniciarla); 403 = hay sesión pero el rol no
 * llega. Distinguirlos le dice al panel si tiene que mandar al login o si
 * simplemente esta persona no puede ver esto.
 */
export async function guardiaAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  return null;
}

/**
 * Vacía TODAS las cachés del área Northdeco de golpe.
 *
 * SOLO para caminos con sesión de admin (hoy: el alta de piezas). Es barato
 * (son mapas en memoria): lo caro sería enseñar datos viejos y que alguien
 * decida sobre ellos. Para el botón público de la galería está
 * `invalidarCachesGaleria()`, más abajo — no uses esta ahí.
 */
export function invalidarCachesNorthdeco(): void {
  invalidar(); // resolver: qué archivo de Drive sirve cada pieza
  invalidarCatalogo(); // catálogo en BD
  invalidarEscaneo(); // foto de Drive del escaneo
  invalidarAvisos(); // informe de avisos + cabeceras GLB
  invalidarTecnico(); // fichas técnicas
}

/**
 * Vacía SOLO lo que necesita la galería del cliente: qué archivo de Drive sirve
 * cada pieza y el catálogo.
 *
 * Lo llama el botón "↻ Actualizar desde Drive" de /northdeco, que está en una
 * página pública y por tanto lo puede pulsar cualquiera con el enlace, sin
 * sesión y tantas veces como quiera. Por eso NO toca las cachés del panel
 * (escaneo, avisos y fichas técnicas):
 *
 *  · Cuestan hasta 25 s de lecturas a Drive. Dejarlas al alcance de un POST
 *    anónimo convierte un botón de cortesía en una palanca gratuita para hacer
 *    trabajar a Drive y a Postgres, y para agotar la cuota de la cuenta de
 *    servicio de la que depende que se vean los modelos.
 *  · Y de rebote, a un admin se le vaciaría la auditoría por debajo mientras la
 *    está mirando, sin que nada explique por qué el informe tarda otra vez.
 *
 * El resolver y el catálogo sí se vacían: son una consulta a Postgres y un
 * listado de Drive, es justo lo que el botón promete, y es lo único que hacía
 * ese endpoint antes de que el catálogo se mudara a la base de datos.
 */
export function invalidarCachesGaleria(): void {
  invalidar(); // resolver: qué archivo de Drive sirve cada pieza
  invalidarCatalogo(); // catálogo en BD
}

/** Traduce un fallo inesperado a un mensaje que se pueda enseñar en el panel. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return "Error inesperado (ver logs del servidor).";
}
