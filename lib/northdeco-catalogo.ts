import fs from "node:fs";
import path from "node:path";
import { prisma } from "./prisma";

/**
 * CATÁLOGO de la galería 3D de /northdeco, leído de la BD (NorthdecoPieza).
 *
 * Por qué existe: el catálogo vivía en public/northdeco/manifest.json, un
 * fichero del REPO. Publicar una pieza obligaba a lanzar un script a mano,
 * commitear el JSON y esperar a que Railway reconstruyera la imagen Docker.
 * Con la tabla, dar de alta una pieza es una fila.
 *
 * El manifest NO se borra: se queda de red de seguridad. Si la tabla está sin
 * sembrar o la BD no responde, este módulo cae al JSON y la galería del cliente
 * sigue en pie. Ojo con la diferencia, que es sutil pero importante:
 *   · tabla con CERO filas  → nunca se sembró  → se cae al manifest
 *   · tabla con filas, todas despublicadas → estado legítimo → se devuelve []
 * Si se cayera al manifest también en el segundo caso, "ocultar todo" haría
 * resucitar las 50 piezas del JSON.
 */

/* ────────────────────────── tipos ────────────────────────── */

export type EstadoPieza = "listo" | "revision";

/** Una pieza del catálogo, con la MISMA forma que traía el manifest. */
export type Pieza = {
  /** Clave estable. Es lo que enlaza el feedback del cliente: no se recalcula. */
  file: string;
  fam: string;
  name: string;
  status: EstadoPieza;
  /** Respaldo. Quien manda para servir el GLB es lib/northdeco-resolver.ts. */
  driveId: string;
  driveName: string | null;
  /** ISO, como en el manifest (en BD es DateTime). */
  modifiedTime: string | null;
  sizeBytes: number | null;
  img: string | null;
  url: string | null;
  variant: string | null;
  sku: string | null;
  material: string | null;
  materials: string[];
  publicada: boolean;
  orden: number;
};

/** De dónde han salido las piezas — útil para avisar en el panel interno. */
export type OrigenCatalogo = "bd" | "manifest";

export type Catalogo = {
  piezas: Pieza[];
  origen: OrigenCatalogo;
  /** Motivo de haber caído al manifest (null si viene de la BD). */
  motivoFallback: string | null;
};

/* ─────────────── normalización y clave (regla congelada) ─────────────── */

/**
 * Clave LAXA de comparación: solo alfanuméricos. Copia EXACTA del `clave()` de
 * lib/northdeco-resolver.ts — no una versión mejorada. Es el único punto donde
 * el catálogo y el servido pueden divergir, y si divergen la galería sirve un
 * archivo distinto del que el panel dice que sirve.
 *   "ND-0606-ARMYGREEN#46" ≡ "ND-0606-ARMYGREEN-46.glb"
 */
export function normalizarClave(s: string): string {
  return s
    .toUpperCase()
    .replace(/\.GLB$/i, "")
    .replace(/[^A-Z0-9]/g, "");
}

/** Familia de un nombre ("ND-0606 🟨" → "ND-0606"). "" si no la lleva. */
export function famDe(s: string): string {
  return (s.toUpperCase().match(/ND-\d+/) ?? [""])[0];
}

/**
 * REGLA CONGELADA de la clave `file`: el SKU en mayúsculas, con "#" → "_", más
 * ".glb". Verificado contra las 50 piezas vivas: las 50 salen idénticas.
 *
 * Por qué importa tanto: NorthdecoReview y NorthdecoComment enganchan por esta
 * cadena SIN clave foránea. Han convivido tres convenciones distintas en los
 * scripts (`fam__sufijo.glb`, `fam__sku.glb`, y esta). Si un alta nueva calcula
 * la clave con otra regla, el visto bueno y los comentarios del cliente
 * desaparecen de la ficha sin ningún error. Una sola regla, y jamás se
 * recalcula la clave de una pieza que ya existe.
 */
export function claveDe(p: {
  sku?: string | null;
  fam?: string | null;
  nombreDrive?: string | null;
}): string {
  const sku =
    p.sku?.trim() ||
    skuDesdeNombreDrive(p.nombreDrive ?? "", p.fam ?? "") ||
    "";
  if (!sku) return "";
  return sku.toUpperCase().replace(/#/g, "_") + ".glb";
}

/**
 * Deduce el SKU a partir del nombre del GLB en Drive.
 *
 * Los nombres reales no siguen una única convención (comprobado en la unidad):
 *   "ND-0602 - WALNUT-BLACK.glb"   → separador " - "
 *   "ND-0603-MAPLE-BLACK"          → sin extensión
 *   "ND-0608-ARMYGREEN#46.glb"     → con almohadilla
 *   "ND-0606-ARMYGREEN-46.glb"     → la MISMA variante, pero con guion
 *   "ND-0645-DARK WALNUT.glb"      → con espacio (y el SKU lo conserva)
 *
 * AVISO CONOCIDO: cuando Drive escribe "-46" no hay forma de saber que el SKU
 * de Shopify es "#46", así que una pieza nueva de esas familias nacerá con el
 * SKU en guion. No rompe el 3D (la resolución por nombre usa `normalizarClave`,
 * que ignora los separadores), pero conviene corregir el SKU desde el panel
 * para que el cruce con Shopify encuentre la variante.
 */
export function skuDesdeNombreDrive(nombreDrive: string, fam: string): string {
  const sinExt = nombreDrive.replace(/\.(glb|gltf)$/i, "").trim();
  if (!sinExt) return "";
  // " - " (el separador que usa el equipo al ordenar carpetas) → guion simple.
  // Los espacios que no rodean a un guion se respetan: hay SKUs con espacio.
  const limpio = sinExt
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const familia = (fam || famDe(sinExt)).toUpperCase();
  if (!familia) return limpio;
  if (limpio === familia || limpio.startsWith(familia + "-")) return limpio;
  if (limpio.startsWith(familia)) return limpio; // "ND-0606ARMYGREEN", raro pero válido
  return `${familia}-${limpio}`;
}

/** Solo "revision" es distinto de "listo": cualquier otro valor se lee "listo". */
export function normalizarEstado(v: string | null | undefined): EstadoPieza {
  return v === "revision" ? "revision" : "listo";
}

/* ─────────────────────── fallback: el manifest ─────────────────────── */

const RUTA_MANIFEST = path.join(
  process.cwd(),
  "public",
  "northdeco",
  "manifest.json",
);

/** Fila del manifest: todo opcional porque el JSON es del repo y ha cambiado de forma. */
type FilaManifest = {
  file?: unknown;
  fam?: unknown;
  name?: unknown;
  status?: unknown;
  driveId?: unknown;
  modifiedTime?: unknown;
  img?: unknown;
  url?: unknown;
  variant?: unknown;
  sku?: unknown;
  material?: unknown;
  materials?: unknown;
};

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

/** Lee public/northdeco/manifest.json. Devuelve [] si no existe o está roto. */
export function leerManifest(): Pieza[] {
  let crudo: FilaManifest[];
  try {
    crudo = JSON.parse(fs.readFileSync(RUTA_MANIFEST, "utf8")) as FilaManifest[];
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  const piezas: Pieza[] = [];
  crudo.forEach((m, i) => {
    const file = texto(m.file);
    const driveId = texto(m.driveId);
    if (!file || !driveId) return; // sin clave o sin archivo no es una pieza
    piezas.push({
      file,
      fam: texto(m.fam) ?? famDe(file),
      name: texto(m.name) ?? file,
      status: normalizarEstado(texto(m.status)),
      driveId,
      driveName: null, // el manifest nunca guardó el nombre real de Drive
      modifiedTime: texto(m.modifiedTime),
      sizeBytes: null,
      img: texto(m.img),
      url: texto(m.url),
      variant: texto(m.variant),
      sku: texto(m.sku),
      material: texto(m.material),
      materials: Array.isArray(m.materials)
        ? m.materials.filter((x): x is string => typeof x === "string")
        : [],
      publicada: true,
      // El orden visual de hoy es el orden del array: se conserva tal cual.
      orden: i,
    });
  });
  return piezas;
}

/* ──────────────────────────── caché ──────────────────────────── */

/**
 * TTL corto (60 s) alineado con la caché de ids de lib/northdeco-resolver.ts.
 * `invalidarCatalogo()` la vacía al instante — hay que llamarla desde el alta,
 * la edición y el botón "↻ Actualizar desde Drive", igual que a `invalidar()`
 * del resolver, o una pieza recién publicada tardará un minuto en aparecer.
 */
const TTL_MS = 60_000;
let cache: { at: number; catalogo: Catalogo } | null = null;

export function invalidarCatalogo(): void {
  cache = null;
}

/** Convierte una fila de la BD al tipo público (Date → ISO). */
type FilaBd = {
  file: string;
  fam: string;
  name: string;
  status: string;
  driveId: string;
  driveName: string | null;
  modifiedTime: Date | null;
  sizeBytes: number | null;
  img: string | null;
  url: string | null;
  variant: string | null;
  sku: string | null;
  material: string | null;
  materials: string[];
  publicada: boolean;
  orden: number;
};

function desdeBd(f: FilaBd): Pieza {
  return {
    file: f.file,
    fam: f.fam,
    name: f.name,
    status: normalizarEstado(f.status),
    driveId: f.driveId,
    driveName: f.driveName,
    modifiedTime: f.modifiedTime ? f.modifiedTime.toISOString() : null,
    sizeBytes: f.sizeBytes,
    img: f.img,
    url: f.url,
    variant: f.variant,
    sku: f.sku,
    material: f.material,
    materials: f.materials,
    publicada: f.publicada,
    orden: f.orden,
  };
}

/**
 * Trae TODAS las filas (publicadas y ocultas) en una sola consulta y las
 * cachea. Son decenas de filas, no miles: sale más barato traerlas enteras y
 * filtrar en memoria que hacer dos consultas, y así se distingue "tabla vacía"
 * (nunca sembrada → fallback) de "todas ocultas" (estado legítimo → []).
 */
async function cargar(): Promise<Catalogo> {
  try {
    const filas = await prisma.northdecoPieza.findMany({
      orderBy: [{ orden: "asc" }, { file: "asc" }],
    });
    if (filas.length) {
      return { piezas: filas.map(desdeBd), origen: "bd", motivoFallback: null };
    }
    // Cero filas = nadie ha sembrado la tabla todavía.
    console.warn(
      "[northdeco-catalogo] NorthdecoPieza está vacía: sirviendo manifest.json. " +
        "Siembra la tabla con sembrarDesdeManifest().",
    );
    return {
      piezas: leerManifest(),
      origen: "manifest",
      motivoFallback: "La tabla NorthdecoPieza está vacía (sin sembrar).",
    };
  } catch (e) {
    // Un fallo de BD NO puede dejar la galería del cliente en blanco, pero
    // tampoco puede pasar inadvertido: por eso se registra en vez de callar.
    console.error("[northdeco-catalogo] fallo leyendo la BD:", e);
    return {
      piezas: leerManifest(),
      origen: "manifest",
      motivoFallback: "La consulta a la BD ha fallado (ver logs del servidor).",
    };
  }
}

async function catalogoCacheado(): Promise<Catalogo> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.catalogo;
  const catalogo = await cargar();
  cache = { at: Date.now(), catalogo };
  return catalogo;
}

/* ───────────────────────── lectura pública ───────────────────────── */

/**
 * Las piezas que ve el cliente en /northdeco: publicadas y en orden estable.
 * Nunca lanza: si la BD falla, devuelve el manifest.
 */
export async function leerCatalogo(): Promise<Pieza[]> {
  const c = await catalogoCacheado();
  return c.piezas.filter((p) => p.publicada);
}

/** Igual que `leerCatalogo()` pero diciendo de dónde salieron las piezas. */
export async function leerCatalogoConOrigen(): Promise<Catalogo> {
  const c = await catalogoCacheado();
  return { ...c, piezas: c.piezas.filter((p) => p.publicada) };
}

/** TODAS las piezas, incluidas las ocultas — para el panel interno. */
export async function leerCatalogoCompleto(): Promise<Pieza[]> {
  return (await catalogoCacheado()).piezas;
}

/** Una pieza por su clave (incluidas las ocultas). */
export async function piezaPorFile(file: string): Promise<Pieza | null> {
  if (!file) return null;
  return (await catalogoCacheado()).piezas.find((p) => p.file === file) ?? null;
}

/**
 * Claves aceptadas por el endpoint público de feedback y por el proxy del GLB.
 * Sale de la misma caché con TTL, así que una pieza recién publicada empieza a
 * aceptar checks y comentarios en un minuto — sin reiniciar el proceso, que es
 * lo que hacía falta con el `Set` de módulo sin caducidad.
 */
export async function clavesPublicadas(): Promise<Set<string>> {
  return new Set((await leerCatalogo()).map((p) => p.file));
}

/**
 * Busca la pieza cuya clave LAXA coincide, esté publicada u oculta. Es la
 * comprobación que evita duplicar una pieza al darla de alta desde el panel:
 * "ND-0606-ARMYGREEN#46" y "ND-0606-ARMYGREEN-46" son la misma pieza aunque
 * sus claves `file` sean cadenas distintas.
 */
export async function piezaPorClaveLaxa(
  clave: string,
): Promise<Pieza | null> {
  const objetivo = normalizarClave(clave);
  if (!objetivo) return null;
  const piezas = (await catalogoCacheado()).piezas;
  return (
    piezas.find((p) => normalizarClave(p.sku ?? p.file) === objetivo) ?? null
  );
}

/* ───────────────────────── siembra inicial ───────────────────────── */

export type ResultadoSiembra = {
  /** Piezas del manifest leídas. */
  leidas: number;
  creadas: number;
  actualizadas: number;
  /** Ya estaban y no se han tocado (siembra sin `sobrescribir`). */
  intactas: number;
  /**
   * Claves con feedback del cliente (check o comentarios) que NO existen en el
   * catálogo. Son comentarios reales de una convención de clave anterior: se
   * REPORTAN, nunca se borran.
   */
  feedbackHuerfano: string[];
};

/**
 * Vuelca public/northdeco/manifest.json a la tabla. Idempotente: se puede
 * repetir sin duplicar (la clave primaria es `file`).
 *
 * Por defecto NO pisa lo que ya está en BD, porque el manifest es la foto vieja
 * y la BD puede llevar ya ediciones del panel. Con `sobrescribir: true` gana el
 * manifest — útil solo para la primera carga.
 *
 * OJO con los títulos: los `name` bonitos de las 50 piezas actuales no los sabe
 * reproducir ningún script (reconstruir-northdeco.ts los reescribe con el SKU).
 * Esta siembra es la que los pone a salvo en BD.
 */
export async function sembrarDesdeManifest(
  opciones: { sobrescribir?: boolean } = {},
): Promise<ResultadoSiembra> {
  const sobrescribir = opciones.sobrescribir === true;
  const piezas = leerManifest();
  const existentes = new Set(
    (
      await prisma.northdecoPieza.findMany({ select: { file: true } })
    ).map((p) => p.file),
  );

  let creadas = 0;
  let actualizadas = 0;
  let intactas = 0;

  for (const p of piezas) {
    const datos = {
      fam: p.fam,
      name: p.name,
      status: p.status,
      driveId: p.driveId,
      driveName: p.driveName,
      modifiedTime: p.modifiedTime ? new Date(p.modifiedTime) : null,
      sizeBytes: p.sizeBytes,
      img: p.img,
      url: p.url,
      variant: p.variant,
      sku: p.sku,
      material: p.material,
      materials: p.materials,
      orden: p.orden,
    };
    if (!existentes.has(p.file)) {
      await prisma.northdecoPieza.create({
        data: { file: p.file, publicada: true, ...datos },
      });
      creadas++;
    } else if (sobrescribir) {
      await prisma.northdecoPieza.update({ where: { file: p.file }, data: datos });
      actualizadas++;
    } else {
      intactas++;
    }
  }

  return {
    leidas: piezas.length,
    creadas,
    actualizadas,
    intactas,
    feedbackHuerfano: await feedbackHuerfano(),
  };
}

/**
 * Claves con feedback del cliente que no corresponden a ninguna pieza del
 * catálogo. Se listan para poder recuperarlas a mano; borrarlas sería tirar
 * comentarios reales de un cliente.
 */
export async function feedbackHuerfano(): Promise<string[]> {
  const [piezas, reviews, comentarios] = await Promise.all([
    prisma.northdecoPieza.findMany({ select: { file: true } }),
    prisma.northdecoReview.findMany({ select: { file: true } }),
    prisma.northdecoComment.findMany({ select: { file: true } }),
  ]);
  const conocidas = new Set(piezas.map((p) => p.file));
  const huerfanas = new Set<string>();
  for (const r of [...reviews, ...comentarios]) {
    if (!conocidas.has(r.file)) huerfanas.add(r.file);
  }
  return [...huerfanas].sort();
}
