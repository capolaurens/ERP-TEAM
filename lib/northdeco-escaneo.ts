import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";
import { prisma } from "./prisma";
import {
  claveDe,
  famDe,
  invalidarCatalogo,
  leerCatalogoCompleto,
  leerCatalogoConOrigen,
  normalizarClave,
  skuDesdeNombreDrive,
  type Pieza,
} from "./northdeco-catalogo";

/**
 * ESCANEO de la carpeta NORTHDECO de Drive contra el catálogo en BD.
 *
 * Responde a las dos preguntas que hoy no tiene respuesta sin abrir Drive a
 * mano y comparar con los ojos:
 *   · qué GLB hay subidos que NADIE ha publicado (candidatos a alta)
 *   · qué piezas publicadas ya NO tienen archivo vivo con ese nombre (rotas:
 *     la galería les está sirviendo el driveId congelado, que Drive entrega
 *     incluso desde la papelera)
 *
 * `escanearDrive()` solo LEE y devuelve datos. Quien escribe es
 * `publicarPiezas()`, y solo con las claves que le pasen.
 *
 * La comparación usa `normalizarClave` (la misma de lib/northdeco-resolver.ts),
 * no la igualdad de cadenas: es la única forma de que el informe diga lo mismo
 * que hace el servido real. "ND-0606-ARMYGREEN#46" y "ND-0606-ARMYGREEN-46.glb"
 * son la misma pieza.
 */

const NORTHDECO_FOLDER =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Cliente único, como en lib/drive.ts: GoogleAuth cachea y renueva el token.
// Crear uno por llamada dispara una petición de token por cada listado.
let clienteCache: ReturnType<typeof driveApi> | null = null;
function cliente() {
  if (!clienteCache) {
    const auth = new googleAuth.GoogleAuth({
      credentials: creds!,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    clienteCache = driveApi({ version: "v3", auth });
  }
  return clienteCache;
}

export function escaneoDisponible(): boolean {
  return !!creds;
}

/* ────────────────────────────── tipos ────────────────────────────── */

export type CarpetaDrive = {
  id: string;
  name: string;
  /** Familia deducida del nombre ("ND-0635 🟨" → "ND-0635"). */
  fam: string;
  trashed: boolean;
};

export type ArchivoDrive = {
  id: string;
  name: string;
  /** Familia de la CARPETA que lo contiene, que es como lo busca el resolver. */
  fam: string;
  carpetaId: string;
  carpetaNombre: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  trashed: boolean;
};

/** Un GLB de Drive que ninguna pieza publicada está usando. */
export type CandidataAlta = {
  /** Clave que tendría al darla de alta (regla congelada de `claveDe`). */
  file: string;
  fam: string;
  sku: string;
  driveId: string;
  driveName: string;
  carpetaId: string;
  carpetaNombre: string;
  sizeBytes: number | null;
  modifiedTime: string | null;
  /** Pega en la ficha si algo huele mal (copia "(2)", carpeta rara, peso). */
  aviso: string | null;
};

/** Una pieza publicada sin GLB vivo que case por nombre. */
export type PiezaSinArchivo = {
  file: string;
  fam: string;
  sku: string | null;
  /** El id al que la galería está cayendo ahora mismo. */
  driveId: string;
  /** La clave normalizada que se ha buscado sin éxito. */
  claveBuscada: string;
  /** false = ni siquiera hay carpeta viva de esa familia. */
  hayCarpeta: boolean;
};

/** Dos GLB vivos con el mismo nombre normalizado: el resolver elegiría uno. */
export type ClaveDuplicada = {
  fam: string;
  clave: string;
  archivos: { id: string; name: string; carpetaNombre: string }[];
};

export type Alcance = "todo" | "publicadas";

export type InformeEscaneo = {
  generadoEn: string;
  alcance: Alcance;
  /** Carpetas ND-XXXX vivas revisadas. */
  carpetasRevisadas: number;
  /** Carpetas descartadas (papelera, sin ND-XXXX, o de servicio "_algo"). */
  carpetasIgnoradas: number;
  /** Modelos encontrados en esas carpetas, incluidos los de la papelera. */
  modelosVistos: number;
  /** Los de arriba que están vivos (ni ellos ni su carpeta en la papelera). */
  modelosVivos: number;
  piezasPublicadas: number;
  sinPublicar: CandidataAlta[];
  publicadasSinArchivo: PiezaSinArchivo[];
  duplicadas: ClaveDuplicada[];
};

/* ───────────────────────────── listados ───────────────────────────── */

const numero = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(v);
  // El tamaño se guarda en una columna INTEGER: por encima de 2 GB (imposible
  // en un GLB, pero Drive puede devolver cualquier cosa) mejor null que romper.
  return Number.isFinite(n) && n >= 0 && n <= 2_147_483_647 ? n : null;
};

/** Un GLB es lo que Drive marca como tal o lo que acaba en .glb/.gltf. */
function esModelo(name: string, mimeType: string): boolean {
  if (mimeType === "application/vnd.google-apps.folder") return false;
  return (
    mimeType === "model/gltf-binary" ||
    mimeType === "model/gltf+json" ||
    /\.(glb|gltf)$/i.test(name)
  );
}

/**
 * Todas las subcarpetas de NORTHDECO. A propósito SIN `trashed = false`: hay
 * que saber cuáles están en la papelera, porque un archivo vivo dentro de una
 * carpeta en la papelera se sigue sirviendo por id.
 */
async function listarCarpetas(): Promise<CarpetaDrive[]> {
  const salida: CarpetaDrive[] = [];
  let pageToken: string | undefined;
  do {
    const r = await cliente().files.list({
      q: `'${NORTHDECO_FOLDER}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
      fields: "nextPageToken, files(id,name,trashed)",
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });
    for (const f of r.data.files ?? []) {
      const name = f.name ?? "";
      salida.push({
        id: f.id!,
        name,
        fam: famDe(name),
        trashed: f.trashed === true,
      });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return salida;
}

/**
 * Cuántas carpetas caben en un `q`. OJO: no es un límite de longitud de la
 * consulta sino de FIABILIDAD. Con lotes grandes (comprobado: a partir de ~20
 * cláusulas `in parents` en or) Drive omite EN SILENCIO archivos subidos hace
 * poco — sin error y con `incompleteSearch: false` — y el escaneo daba por
 * inexistentes GLB que estaban ahí (ND-0949, 2026-09-03). Con lotes de ≤6 los
 * devuelve todos; 5 deja margen. La velocidad se recupera lanzando varios
 * lotes en paralelo (PARALELO_LOTES).
 */
const LOTE_CARPETAS = 5;
const PARALELO_LOTES = 6;

/** Hijos de un conjunto de carpetas, en lotes. Tampoco filtra la papelera. */
async function listarArchivos(
  carpetas: CarpetaDrive[],
): Promise<ArchivoDrive[]> {
  const porId = new Map(carpetas.map((c) => [c.id, c]));

  async function listarLote(lote: CarpetaDrive[]): Promise<ArchivoDrive[]> {
    const salida: ArchivoDrive[] = [];
    const q = "(" + lote.map((c) => `'${c.id}' in parents`).join(" or ") + ")";
    let pageToken: string | undefined;
    do {
      const r = await cliente().files.list({
        q,
        fields:
          "nextPageToken, files(id,name,mimeType,size,modifiedTime,trashed,parents)",
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        corpora: "allDrives",
      });
      for (const f of r.data.files ?? []) {
        const name = f.name ?? "";
        if (!esModelo(name, f.mimeType ?? "")) continue;
        const padre = (f.parents ?? []).map((p) => porId.get(p)).find(Boolean);
        if (!padre) continue; // hijo de otra carpeta del lote que no nos toca
        salida.push({
          id: f.id!,
          name,
          // La familia la manda la CARPETA: es como busca lib/northdeco-resolver.ts.
          fam: padre.fam,
          carpetaId: padre.id,
          carpetaNombre: padre.name,
          sizeBytes: numero(f.size),
          modifiedTime: f.modifiedTime ?? null,
          // Un archivo vivo dentro de una carpeta en la papelera está, de hecho,
          // en la papelera: se propaga el estado de la carpeta.
          trashed: f.trashed === true || padre.trashed,
        });
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return salida;
  }

  const lotes: CarpetaDrive[][] = [];
  for (let i = 0; i < carpetas.length; i += LOTE_CARPETAS) {
    lotes.push(carpetas.slice(i, i + LOTE_CARPETAS));
  }
  const salida: ArchivoDrive[] = [];
  for (let i = 0; i < lotes.length; i += PARALELO_LOTES) {
    const grupo = lotes.slice(i, i + PARALELO_LOTES);
    const resultados = await Promise.all(grupo.map(listarLote));
    for (const r of resultados) salida.push(...r);
  }
  return salida;
}

/* ────────────────────────────── escaneo ────────────────────────────── */

/**
 * Aviso corto para la ficha del candidato (null si no hay nada raro).
 *
 * El más importante es el primero: que el SKU deducido NO vuelva a casar con el
 * nombre del archivo. lib/northdeco-resolver.ts busca el GLB comparando
 * `normalizarClave(sku)` con el nombre del archivo, así que si no coinciden la
 * pieza nace pegada para siempre al driveId congelado — y Drive sirve por id
 * incluso archivos que alguien mande luego a la papelera.
 */
function avisoDe(a: ArchivoDrive, sku: string): string | null {
  if (normalizarClave(sku) !== normalizarClave(a.name)) {
    return `El SKU deducido ("${sku}") no casa con el nombre del archivo ("${a.name}"). La pieza se quedará pegada a este driveId en vez de resolverse por nombre: mejor renombrar el archivo en Drive antes de publicarla.`;
  }
  if (/\s\(\d+\)(\.\w+)?$/.test(a.name)) {
    return 'Parece una copia de Drive ("(2)"): el original con el nombre bueno suele estar en la papelera. Renómbralo en Drive antes de publicarlo.';
  }
  if (famDe(a.name) && famDe(a.name) !== a.fam) {
    return `El archivo dice ${famDe(a.name)} pero está en la carpeta ${a.fam}.`;
  }
  if (a.sizeBytes != null && a.sizeBytes > 20_000_000) {
    return "Pesa más de 20 MB: parece un export crudo, sin pasar por el compresor.";
  }
  return null;
}

/* Caché de 5 minutos por alcance: el barrido es barato pero no gratis, y esto
 * lo llama un panel de admin donde se recarga la página cada dos por tres. */
const TTL_ESCANEO_MS = 5 * 60_000;
const cacheEscaneo = new Map<Alcance, { at: number; informe: InformeEscaneo }>();

export function invalidarEscaneo(): void {
  cacheEscaneo.clear();
}

/**
 * Compara Drive con el catálogo. NO escribe nada.
 *
 * `alcance: "todo"` (por defecto) recorre las ~183 carpetas de la unidad, que
 * es lo único que descubre familias enteras sin publicar. `"publicadas"` se
 * limita a las familias que ya están en el catálogo (más rápido, pero solo ve
 * variantes nuevas de piezas conocidas).
 *
 * Nunca en el render de la página pública: esto vive detrás de requireAdmin().
 */
export async function escanearDrive(
  opciones: { alcance?: Alcance; forzar?: boolean } = {},
): Promise<InformeEscaneo> {
  const alcance: Alcance = opciones.alcance ?? "todo";
  if (!opciones.forzar) {
    const c = cacheEscaneo.get(alcance);
    if (c && Date.now() - c.at < TTL_ESCANEO_MS) return c.informe;
  }
  if (!creds) {
    throw new Error(
      "Google Drive no está configurado (falta GOOGLE_SERVICE_ACCOUNT_JSON).",
    );
  }

  const piezas = await leerCatalogoCompleto();
  const famsPublicadas = new Set(piezas.map((p) => p.fam.toUpperCase()));

  const todasLasCarpetas = await listarCarpetas();
  const revisables = todasLasCarpetas.filter(
    (c) =>
      !c.trashed &&
      !!c.fam &&
      // "_backup-materiales-…" y compañía son carpetas de servicio, no catálogo.
      !c.name.trim().startsWith("_") &&
      (alcance === "todo" || famsPublicadas.has(c.fam)),
  );

  const archivos = await listarArchivos(revisables);
  const vivos = archivos.filter((a) => !a.trashed);

  // Índice de lo que hay en Drive: familia + clave laxa → archivos.
  const porClave = new Map<string, ArchivoDrive[]>();
  for (const a of vivos) {
    const k = `${a.fam}|${normalizarClave(a.name)}`;
    const lista = porClave.get(k);
    if (lista) lista.push(a);
    else porClave.set(k, [a]);
  }

  // 1) Piezas publicadas cuyo archivo ya no está (o se llama de otra forma).
  const familiasVivas = new Set(revisables.map((c) => c.fam));
  const usadas = new Set<string>();
  const publicadasSinArchivo: PiezaSinArchivo[] = [];
  for (const p of piezas) {
    if (!p.publicada) continue;
    const fam = p.fam.toUpperCase();
    // Se compara contra el mismo criterio con el que sirve el resolver: la
    // clave laxa del SKU (o de la clave, si no hay SKU) dentro de la carpeta de
    // su familia. Los dos alcances listan siempre las familias del catálogo, así
    // que esta comprobación es válida en ambos.
    const clave = normalizarClave(p.sku ?? p.file);
    const k = `${fam}|${clave}`;
    if (porClave.has(k)) {
      usadas.add(k);
    } else {
      publicadasSinArchivo.push({
        file: p.file,
        fam,
        sku: p.sku,
        driveId: p.driveId,
        claveBuscada: clave,
        hayCarpeta: familiasVivas.has(fam),
      });
    }
  }

  // 2) GLB vivos que ninguna pieza publicada está usando.
  const sinPublicar: CandidataAlta[] = [];
  const duplicadas: ClaveDuplicada[] = [];
  for (const [k, lista] of porClave) {
    if (lista.length > 1) {
      const [fam, clave] = k.split("|");
      duplicadas.push({
        fam,
        clave,
        archivos: lista.map((a) => ({
          id: a.id,
          name: a.name,
          carpetaNombre: a.carpetaNombre,
        })),
      });
    }
    if (usadas.has(k)) continue;
    // Si hay varias copias con el mismo nombre, la más reciente — mismo
    // criterio de desempate que usa el resolver al servir.
    const a = [...lista].sort((x, y) =>
      (y.modifiedTime ?? "").localeCompare(x.modifiedTime ?? ""),
    )[0];
    const sku = skuDesdeNombreDrive(a.name, a.fam);
    sinPublicar.push({
      file: claveDe({ sku }),
      fam: a.fam,
      sku,
      driveId: a.id,
      driveName: a.name,
      carpetaId: a.carpetaId,
      carpetaNombre: a.carpetaNombre,
      sizeBytes: a.sizeBytes,
      modifiedTime: a.modifiedTime,
      aviso: avisoDe(a, sku),
    });
  }

  const orden = (x: { fam: string }, y: { fam: string }) =>
    x.fam.localeCompare(y.fam);
  sinPublicar.sort((x, y) => orden(x, y) || x.file.localeCompare(y.file));
  publicadasSinArchivo.sort((x, y) => orden(x, y) || x.file.localeCompare(y.file));
  duplicadas.sort((x, y) => orden(x, y) || x.clave.localeCompare(y.clave));

  const informe: InformeEscaneo = {
    generadoEn: new Date().toISOString(),
    alcance,
    carpetasRevisadas: revisables.length,
    carpetasIgnoradas: todasLasCarpetas.length - revisables.length,
    modelosVistos: archivos.length,
    modelosVivos: vivos.length,
    piezasPublicadas: piezas.filter((p) => p.publicada).length,
    sinPublicar,
    publicadasSinArchivo,
    duplicadas,
  };
  cacheEscaneo.set(alcance, { at: Date.now(), informe });
  return informe;
}

/* ──────────────────────────── alta de piezas ──────────────────────────── */

export type ResultadoPublicacion = {
  /** Claves dadas de alta como pieza nueva. */
  publicadas: string[];
  /**
   * Claves que ya existían en el catálogo con otra escritura (p. ej. el SKU
   * lleva "#" y el archivo de Drive un guion): se ha refrescado su archivo en
   * vez de crear una fila nueva. Crear una segunda fila habría dejado el visto
   * bueno y los comentarios del cliente colgando de la clave vieja.
   */
  reenganchadas: { clave: string; file: string }[];
  /** Claves que ya no aparecen en el escaneo (alguien las movió o renombró). */
  noEncontradas: string[];
  /**
   * Claves cuya escritura ha fallado, con el motivo. Existen porque el alta va
   * pieza a pieza y NO en una transacción: si una excepción se propagara, la
   * petición moriría con un 500 después de haber creado parte de las filas y
   * sin decir cuáles. Aislando cada una, el lote se aplica entero salvo las
   * problemáticas y el panel puede nombrarlas.
   */
  fallidas: { clave: string; motivo: string }[];
};

/**
 * Da de alta en el catálogo las candidatas elegidas del escaneo.
 *
 * Rellena lo que sabe Drive (fam, sku, driveId, driveName, sizeBytes,
 * modifiedTime). La foto, la URL, la variante y el material NO salen de Drive:
 * se cruzan después contra el catálogo de Shopify, así que la pieza nace con
 * el SKU de nombre provisional y sin foto — visible en la galería, pero
 * marcada como incompleta a simple vista.
 *
 * Idempotente: repetirla no duplica (upsert por clave) y nunca recalcula la
 * clave de una pieza que ya existe.
 */
export async function publicarPiezas(
  claves: string[],
): Promise<ResultadoPublicacion> {
  const pedidas = [...new Set(claves.filter((c) => typeof c === "string" && c))];
  const resultado: ResultadoPublicacion = {
    publicadas: [],
    reenganchadas: [],
    noEncontradas: [],
    fallidas: [],
  };
  if (!pedidas.length) return resultado;

  // GUARDA IMPRESCINDIBLE: si el catálogo se está sirviendo del manifest es que
  // la tabla está vacía. Crear aquí la primera fila haría que `leerCatalogo()`
  // dejara de caer al JSON y la galería pasara de 50 piezas a UNA.
  const { origen } = await leerCatalogoConOrigen();
  if (origen !== "bd") {
    throw new Error(
      "El catálogo se está sirviendo de manifest.json (la tabla NorthdecoPieza " +
        "está vacía o la BD falla). Siembra primero con sembrarDesdeManifest(): " +
        "dar de alta ahora dejaría la galería con una sola pieza.",
    );
  }

  const informe = await escanearDrive();
  const candidatas = new Map(informe.sinPublicar.map((c) => [c.file, c]));
  const catalogo = await leerCatalogoCompleto();
  // DOS índices por clave LAXA, no uno. Es lo que evita duplicar una pieza que
  // ya existe escrita de otra forma… y, sobre todo, lo que evita el choque de
  // clave primaria:
  //
  // Una pieza puede tener el SKU corregido a mano (p. ej. "ND-0606-ARMYGREN" →
  // "ND-0606-ARMYGREEN") mientras el GLB de Drive conserva el nombre viejo. Su
  // `file` NO se recalcula nunca, así que la candidata que sale del escaneo
  // calcula exactamente ese mismo `file` pero un SKU distinto. Buscando solo
  // por SKU no se encontraba la fila existente y el `create` de abajo moría con
  // un P2002 a mitad del lote, dejando el alta a medias y un 500 sin explicar.
  //
  // Se consulta primero por SKU (el criterio de siempre) y solo se cae al
  // `file` cuando el SKU no dice nada, para no cambiar qué fila se reengancha
  // en los casos que hoy ya funcionan.
  const porSkuLaxo = new Map<string, Pieza>();
  const porFileLaxo = new Map<string, Pieza>();
  for (const p of catalogo) {
    porFileLaxo.set(normalizarClave(p.file), p);
    if (p.sku) porSkuLaxo.set(normalizarClave(p.sku), p);
  }

  const maximo = await prisma.northdecoPieza.aggregate({
    _max: { orden: true },
  });
  // Las altas van AL FINAL: reordenar el catálogo publicado haría que el
  // cliente viera moverse piezas que ya había revisado.
  let siguienteOrden = (maximo._max.orden ?? 0) + 1;

  for (const clave of pedidas) {
    const c = candidatas.get(clave);
    if (!c) {
      resultado.noEncontradas.push(clave);
      continue;
    }

    const archivo = {
      driveId: c.driveId,
      driveName: c.driveName,
      sizeBytes: c.sizeBytes,
      modifiedTime: c.modifiedTime ? new Date(c.modifiedTime) : null,
    };

    const yaExiste =
      porSkuLaxo.get(normalizarClave(c.sku)) ??
      porFileLaxo.get(normalizarClave(c.file));

    // Cada pieza en su propio try: un fallo aislado (choque de clave por una
    // publicación simultánea de otro admin, una fecha ilegible de Drive, un
    // corte de Postgres a media tanda) no puede tumbar el lote entero ni dejar
    // el catálogo escrito a medias sin decir por dónde se quedó.
    try {
      if (yaExiste) {
        await prisma.northdecoPieza.update({
          where: { file: yaExiste.file },
          data: { ...archivo, publicada: true },
        });
        resultado.reenganchadas.push({ clave, file: yaExiste.file });
        continue;
      }

      await prisma.northdecoPieza.create({
        data: {
          file: c.file,
          fam: c.fam,
          // Nombre provisional: el título comercial llega al cruzar con Shopify.
          name: c.sku,
          status: "listo",
          ...archivo,
          materials: [],
          sku: c.sku,
          publicada: true,
          orden: siguienteOrden++,
        },
      });
      resultado.publicadas.push(c.file);
    } catch (e) {
      console.error(`[northdeco-escaneo] alta de ${clave}:`, e);
      resultado.fallidas.push({
        clave,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (resultado.publicadas.length || resultado.reenganchadas.length) {
    // Sin esto la galería tardaría hasta un minuto en enterarse, y el endpoint
    // de feedback rechazaría la pieza nueva con "Modelo no válido".
    invalidarCatalogo();
    invalidarEscaneo();
  }
  return resultado;
}
