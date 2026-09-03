import fs from "node:fs";
import path from "node:path";
import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";

/**
 * AUDITORÍA de la galería /northdeco: compara lo que hay en Drive con lo que
 * publica el catálogo y devuelve una lista de AVISOS accionables.
 *
 * Por qué existe: la galería NO sirve el `driveId` guardado, sino el archivo que
 * lib/northdeco-resolver.ts encuentra POR NOMBRE dentro de la carpeta de la
 * familia; y si no lo encuentra cae EN SILENCIO al `driveId` congelado. Como
 * Drive entrega un archivo por id aunque esté en la papelera, una ficha puede
 * llevar semanas mostrando el modelo equivocado sin que nada falle ni se registre.
 * Hoy el único detector es el cliente diciendo "este mueble está mal".
 *
 * Coste: por defecto solo se auditan las familias publicadas (1 listado de
 * carpetas + 1 por familia ≈ 13 llamadas) más 2 peticiones Range de ~2 KB por
 * modelo servido para leer la cabecera del GLB. NUNCA se descarga un GLB entero
 * (pesan hasta 40 MB) y NUNCA debe llamarse desde el render de la página pública.
 *
 * Fail-soft por contrato: esta función no lanza. Si Drive falla, lo que se sabe
 * se devuelve igual y el fallo aparece como un aviso `error-drive` con
 * `parcial: true`. Un informe a medias es útil; una excepción tumba el panel.
 */

/* ───────────────────────────── Tipos públicos ───────────────────────────── */

export const TIPOS_AVISO = [
  "archivo-en-papelera",
  "nombre-de-otra-familia",
  "sin-archivo",
  "carpeta-duplicada",
  "varios-candidatos",
  "peso-excesivo",
  "geometria-duplicada",
  "respaldo-en-papelera",
  "sin-material",
  "archivo-ilegible",
  "sin-publicar",
  "error-drive",
] as const;

export type TipoAviso = (typeof TIPOS_AVISO)[number];

export type GravedadAviso = "alta" | "media" | "baja";

export type Aviso = {
  tipo: TipoAviso;
  gravedad: GravedadAviso;
  /** Clave `file` de la ficha afectada; null si el aviso es de la carpeta/familia. */
  pieza: string | null;
  fam: string;
  /** Qué pasa y qué hacer, en una frase. Se enseña tal cual en el panel. */
  mensaje: string;
  /** Datos de apoyo (nombres reales, fechas, tamaños). Opcional. */
  detalle?: string;
  /** Ids de Drive implicados; el primero es el protagonista del aviso. */
  driveIds?: string[];
  /** Enlace directo a Drive para arreglarlo de un clic. */
  enlace?: string;
};

/**
 * Forma MÍNIMA que necesita una pieza para poder auditarla. La cumplen tanto las
 * filas del manifest de hoy como las de la futura tabla del catálogo en BD, así
 * que cuando el catálogo se mueva a Postgres basta con inyectarlo por `piezas`.
 */
export type PiezaAuditable = {
  file: string;
  fam: string;
  sku?: string | null;
  driveId?: string | null;
  name?: string | null;
};

export type InformeAvisos = {
  generadoEn: string;
  piezas: number;
  /** Archivos de Drive mirados (incluidos los de la papelera). */
  archivosRevisados: number;
  avisos: Aviso[];
  resumen: Record<TipoAviso, number>;
  /** true si Drive falló en algún punto: el informe está incompleto, no limpio. */
  parcial: boolean;
};

export type OpcionesAuditoria = {
  /** Catálogo a auditar. Por defecto, el manifest del repo. */
  piezas?: PiezaAuditable[];
  /** Leer la cabecera de cada GLB (geometría y materiales). Por defecto true. */
  conCabeceras?: boolean;
  /** Ignorar las cachés y volver a preguntarle a Drive. */
  refrescar?: boolean;
};

/* ─────────────────────────────── Constantes ─────────────────────────────── */

const NORTHDECO_FOLDER =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

/** Los modelos hechos a mano pesan 0,4-3 MB; los exports crudos, 20-40 MB. */
export const UMBRAL_PESO_BYTES = 15_000_000;

/** Cabeceras leídas en paralelo. Más de 8 y Drive empieza a devolver 429. */
const CONCURRENCIA_CABECERAS = 8;

const TTL_LISTADOS_MS = 5 * 60_000; // igual que la caché de carpetas del resolver
const TTL_INFORME_MS = 5 * 60_000;
/** Las cabeceras van indexadas por md5: si el archivo cambia, cambia la clave y
 *  la entrada vieja deja de consultarse sola. El TTL es solo higiene. */
const TTL_CABECERAS_MS = 60 * 60_000;

const GRAVEDAD_POR_TIPO: Record<TipoAviso, GravedadAviso> = {
  "archivo-en-papelera": "alta",
  "nombre-de-otra-familia": "alta",
  "sin-archivo": "alta",
  "carpeta-duplicada": "media",
  "varios-candidatos": "media",
  "peso-excesivo": "media",
  "geometria-duplicada": "media",
  "respaldo-en-papelera": "media",
  "sin-material": "media",
  "archivo-ilegible": "media",
  "sin-publicar": "baja",
  "error-drive": "media",
};

const ORDEN_GRAVEDAD: Record<GravedadAviso, number> = { alta: 0, media: 1, baja: 2 };

/* ────────────────────────────── Normalización ────────────────────────────── */

/**
 * Clave de comparación: solo alfanuméricos ("ND-0606-ARMYGREEN#46" ≡
 * "ND-0606-ARMYGREEN-46.glb"). Es COPIA EXACTA de `clave()` de
 * lib/northdeco-resolver.ts, a propósito: si esta normalización mejora o
 * diverge, la auditoría mide una realidad distinta de la que sirve la web.
 * Se exporta para que el resolver la importe de aquí y deje de duplicarla.
 */
export const claveDe = (s: string): string =>
  s.toUpperCase().replace(/\.GLB$/i, "").replace(/[^A-Z0-9]/g, "");

/** Familia ("ND-0606") de un nombre de archivo o de carpeta. "" si no la lleva. */
export const famDe = (s: string): string =>
  (s.toUpperCase().match(/ND-\d+/) ?? [""])[0];

/**
 * ¿Es un modelo 3D? Se pregunta por el MIME que da Drive y no por la extensión,
 * porque hay GLB subidos SIN «.glb» en el nombre (3 de los archivos publicados
 * hoy). Filtrar por extensión los dejaba fuera de la auditoría en silencio.
 */
const esModelo = (a: { nombre: string; mime: string | null }): boolean =>
  a.mime === "model/gltf-binary" ||
  a.mime === "model/gltf+json" ||
  /\.(glb|gltf)$/i.test(a.nombre);

/** Contenedor binario: un .gltf es JSON suelto y no tiene cabecera que leer. */
const esGlbBinario = (a: { nombre: string; mime: string | null }): boolean =>
  esModelo(a) && a.mime !== "model/gltf+json" && !/\.gltf$/i.test(a.nombre);

/**
 * Distancia de edición ACOTADA (la misma idea que scripts/reconstruir-northdeco.ts).
 * Sirve para proponer "¿querías este otro?" cuando el nombre no casa por una
 * errata ("GRASSGREN"/"GRASSGREEN") o por el "(2)" que pega Drive al subir dos
 * veces el mismo archivo. Se rinde en cuanto las longitudes se separan más de 3.
 */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const fila: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const previo = fila[j];
      fila[j] = Math.min(
        fila[j] + 1,
        fila[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = previo;
    }
  }
  return fila[b.length];
}

const enlaceArchivo = (id: string): string =>
  `https://drive.google.com/file/d/${id}/view`;
const enlaceCarpeta = (id: string): string =>
  `https://drive.google.com/drive/folders/${id}`;

const fmtMB = (bytes: number): string =>
  `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(bytes / 1e6)} MB`;
const fmtNum = (n: number): string => new Intl.NumberFormat("es-ES").format(n);
const fmtFecha = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(iso))
    : "sin fecha";

const motivo = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/* ─────────────────────────── Cliente de Drive ─────────────────────────── */

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Un único cliente: GoogleAuth cachea y renueva el token por dentro. Crear uno
// por llamada hacía que cada petición pidiera su propio token y las ráfagas
// acababan en ETIMEDOUT (mismo motivo que el cliente cacheado de lib/drive.ts).
let clienteCacheado: ReturnType<typeof driveApi> | null = null;
function cliente() {
  if (!clienteCacheado) {
    const auth = new googleAuth.GoogleAuth({
      credentials: creds!,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    clienteCacheado = driveApi({ version: "v3", auth });
  }
  return clienteCacheado;
}

/* ──────────────────────────── Catálogo (origen) ──────────────────────────── */

function manifestDelRepo(): PiezaAuditable[] {
  try {
    const crudo = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "public", "northdeco", "manifest.json"),
        "utf8",
      ),
    ) as PiezaAuditable[];
    return Array.isArray(crudo) ? crudo : [];
  } catch {
    return [];
  }
}

/* ───────────────────────── Foto de Drive (fase A) ───────────────────────── */

type CarpetaDrive = {
  id: string;
  nombre: string;
  fam: string;
  enPapelera: boolean;
};

type ArchivoDrive = {
  id: string;
  nombre: string;
  bytes: number | null;
  md5: string | null;
  modificado: string | null;
  /** Papelera EFECTIVA: el archivo o la carpeta que lo contiene. */
  enPapelera: boolean;
  /** El archivo en sí está en la papelera (no solo su carpeta). */
  papeleraPropia: boolean;
  mime: string | null;
  carpetaId: string;
  carpetaNombre: string;
};

type FotoDrive = {
  carpetas: CarpetaDrive[];
  /** Carpeta que GANA por familia: la primera VIVA que lista Drive, igual que
   *  hace `carpetaDe()` del resolver. Con carpetas duplicadas no es determinista. */
  ganadoraPorFam: Map<string, CarpetaDrive>;
  archivosPorFam: Map<string, ArchivoDrive[]>;
  archivosPorId: Map<string, ArchivoDrive>;
  errores: { fam: string; motivo: string }[];
};

let fotoCache: { at: number; clave: string; foto: FotoDrive } | null = null;

/** Lista hijos de una carpeta SIN excluir la papelera: la anomalía nº1 es
 *  justamente lo que está en la papelera, así que filtrarla la haría invisible. */
async function listarHijos(
  carpetaId: string,
  soloCarpetas: boolean,
): Promise<{
  id: string;
  name: string;
  size: string | null;
  md5Checksum: string | null;
  modifiedTime: string | null;
  trashed: boolean;
  mimeType: string | null;
}[]> {
  const filtroTipo = soloCarpetas
    ? " and mimeType = 'application/vnd.google-apps.folder'"
    : "";
  const out: {
    id: string;
    name: string;
    size: string | null;
    md5Checksum: string | null;
    modifiedTime: string | null;
    trashed: boolean;
    mimeType: string | null;
  }[] = [];
  let pageToken: string | undefined;
  do {
    const r = await cliente().files.list({
      q: `'${carpetaId}' in parents${filtroTipo}`,
      fields:
        "nextPageToken, files(id,name,size,md5Checksum,modifiedTime,trashed,mimeType)",
      pageSize: 1000,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      corpora: "allDrives",
    });
    for (const f of r.data.files ?? []) {
      if (!f.id) continue;
      out.push({
        id: f.id,
        name: f.name ?? "",
        size: f.size ?? null,
        md5Checksum: f.md5Checksum ?? null,
        modifiedTime: f.modifiedTime ?? null,
        trashed: f.trashed === true,
        mimeType: f.mimeType ?? null,
      });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * Retrata Drive para las familias pedidas: carpetas (vivas y en papelera) y
 * los archivos de cada una. Una sola pasada, cacheada, tolerante a fallos: si
 * una familia revienta, esa familia queda sin archivos y el motivo se anota.
 */
async function fotografiarDrive(
  familias: string[],
  refrescar: boolean,
): Promise<FotoDrive> {
  const clave = familias.slice().sort().join(",");
  if (
    !refrescar &&
    fotoCache &&
    fotoCache.clave === clave &&
    Date.now() - fotoCache.at < TTL_LISTADOS_MS
  ) {
    return fotoCache.foto;
  }

  const foto: FotoDrive = {
    carpetas: [],
    ganadoraPorFam: new Map(),
    archivosPorFam: new Map(),
    archivosPorId: new Map(),
    errores: [],
  };
  const buscadas = new Set(familias.filter(Boolean));

  let carpetas: CarpetaDrive[] = [];
  try {
    carpetas = (await listarHijos(NORTHDECO_FOLDER, true))
      .map((c) => ({
        id: c.id,
        nombre: c.name,
        fam: famDe(c.name),
        enPapelera: c.trashed,
      }))
      .filter((c) => buscadas.has(c.fam));
  } catch (e) {
    foto.errores.push({ fam: "", motivo: motivo(e) });
    fotoCache = { at: Date.now(), clave, foto };
    return foto;
  }
  foto.carpetas = carpetas;

  // Quién manda: la PRIMERA carpeta VIVA que Drive lista, exactamente el
  // criterio de `carpetaDe()`. Se filtra la papelera antes de elegir para no
  // alterar ese orden (el resolver la excluye ya en la query).
  for (const c of carpetas.filter((x) => !x.enPapelera)) {
    if (!foto.ganadoraPorFam.has(c.fam)) foto.ganadoraPorFam.set(c.fam, c);
  }

  for (const carpeta of carpetas) {
    try {
      const hijos = await listarHijos(carpeta.id, false);
      const lista = foto.archivosPorFam.get(carpeta.fam) ?? [];
      for (const h of hijos) {
        if (h.mimeType === "application/vnd.google-apps.folder") continue;
        const a: ArchivoDrive = {
          id: h.id,
          nombre: h.name,
          bytes: h.size != null ? Number(h.size) : null,
          md5: h.md5Checksum,
          modificado: h.modifiedTime,
          mime: h.mimeType,
          // Un archivo vivo dentro de una carpeta en la papelera sigue siendo
          // servible por id, pero para el equipo "está en la papelera".
          enPapelera: h.trashed || carpeta.enPapelera,
          papeleraPropia: h.trashed,
          carpetaId: carpeta.id,
          carpetaNombre: carpeta.nombre,
        };
        lista.push(a);
        foto.archivosPorId.set(a.id, a);
      }
      foto.archivosPorFam.set(carpeta.fam, lista);
    } catch (e) {
      foto.errores.push({ fam: carpeta.fam, motivo: motivo(e) });
    }
  }

  fotoCache = { at: Date.now(), clave, foto };
  return foto;
}

/** Metadatos de un id suelto (un `driveId` congelado que ya no vive en su
 *  carpeta). Devuelve null si no se puede saber; nunca lanza. */
async function metadatosDe(id: string): Promise<ArchivoDrive | null> {
  try {
    const r = await cliente().files.get({
      fileId: id,
      fields: "id,name,size,md5Checksum,modifiedTime,trashed,mimeType",
      supportsAllDrives: true,
    });
    const d = r.data;
    return {
      id,
      nombre: d.name ?? "",
      bytes: d.size != null ? Number(d.size) : null,
      md5: d.md5Checksum ?? null,
      modificado: d.modifiedTime ?? null,
      enPapelera: d.trashed === true,
      papeleraPropia: d.trashed === true,
      mime: d.mimeType ?? null,
      carpetaId: "",
      carpetaNombre: "",
    };
  } catch {
    return null;
  }
}

/* ───────────────── Cabecera del GLB por Range (fase B) ───────────────── */

/** Trozo del JSON de un glTF que de verdad se usa. Sin `any`: solo lo leído. */
type GlbJson = {
  asset?: { generator?: string; version?: string };
  accessors?: { count?: number }[];
  meshes?: {
    primitives?: { attributes?: Record<string, number>; indices?: number }[];
  }[];
  materials?: unknown[];
  images?: unknown[];
  nodes?: unknown[];
  extensionsUsed?: string[];
};

export type CabeceraGlb = {
  vertices: number;
  triangulos: number;
  primitivas: number;
  nodos: number;
  materiales: number;
  imagenes: number;
  /** Tamaño total declarado en la cabecera del GLB. */
  bytesTotales: number;
  generador: string | null;
  extensiones: string[];
};

const MAGIC_GLTF = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
/** Un chunk JSON de más de 32 MB es basura o un .gltf empaquetado raro: se corta. */
const MAX_JSON_BYTES = 32 * 1024 * 1024;

const cabeceras = new Map<string, { at: number; cabecera: CabeceraGlb }>();

/** Descarga un RANGO de bytes. Es lo que evita bajarse 40 MB por modelo. */
async function rango(fileId: string, desde: number, hasta: number): Promise<Buffer> {
  const r = await cliente().files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    {
      responseType: "arraybuffer",
      headers: { Range: `bytes=${desde}-${hasta}` },
    },
  );
  return Buffer.from(r.data as ArrayBuffer);
}

/**
 * Lee SOLO la cabecera de un GLB: 20 bytes para saber cuánto ocupa el chunk
 * JSON (que en un GLB va siempre primero) y otra petición con esos bytes
 * exactos (~100-300 KB frente a los ~20 MB del archivo, porque las texturas
 * viven en el chunk BIN y no se tocan).
 *
 * Se parsea a mano con Buffer.readUInt32LE para no arrastrar @gltf-transform,
 * que descargaría el archivo entero. Defensivo a conciencia: en la unidad hay
 * GLB truncados y ficheros que ni siquiera son glTF.
 */
async function leerCabecera(fileId: string): Promise<CabeceraGlb> {
  const cab = await rango(fileId, 0, 19);
  if (cab.length < 20) throw new Error("cabecera truncada (menos de 20 bytes)");
  if (cab.readUInt32LE(0) !== MAGIC_GLTF) throw new Error("no es un GLB (magic incorrecto)");
  const bytesTotales = cab.readUInt32LE(8);
  const jsonLen = cab.readUInt32LE(12);
  if (cab.readUInt32LE(16) !== CHUNK_JSON) throw new Error("el primer chunk no es JSON");
  if (jsonLen <= 0 || jsonLen > MAX_JSON_BYTES) {
    throw new Error(`chunk JSON de tamaño imposible (${jsonLen} bytes)`);
  }

  const crudo = await rango(fileId, 20, 19 + jsonLen);
  // El chunk se rellena con espacios/NUL hasta múltiplo de 4: hay que quitarlos
  // antes de JSON.parse o revienta.
  const texto = crudo.toString("utf8").replace(/[\0\s]+$/, "");
  const j = JSON.parse(texto) as GlbJson;

  const accesor = (i: number | undefined): number =>
    typeof i === "number" ? (j.accessors?.[i]?.count ?? 0) : 0;

  let vertices = 0;
  let triangulos = 0;
  let primitivas = 0;
  for (const mesh of j.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      primitivas++;
      const pos = accesor(prim.attributes?.POSITION);
      vertices += pos;
      // Misma regla de conteo que countTris/countVerts de
      // lib/compressor/mesh-simplify.ts, para que los números cuadren con los
      // que reporta el compresor. Con Draco los `count` siguen en los accessors.
      triangulos += prim.indices != null ? accesor(prim.indices) / 3 : pos / 3;
    }
  }

  return {
    vertices,
    triangulos: Math.round(triangulos),
    primitivas,
    nodos: j.nodes?.length ?? 0,
    materiales: j.materials?.length ?? 0,
    imagenes: j.images?.length ?? 0,
    bytesTotales,
    generador: j.asset?.generator ?? null,
    extensiones: j.extensionsUsed ?? [],
  };
}

/** Cabecera con caché. La clave es el md5 (si Drive lo da): cuando el archivo
 *  cambia, cambia el md5 y la entrada vieja se queda huérfana — nunca hay dato
 *  obsoleto. Sin md5 se cae al id + fecha de modificación. */
async function cabeceraDe(a: ArchivoDrive): Promise<CabeceraGlb> {
  const clave = a.md5 ?? `${a.id}@${a.modificado ?? ""}`;
  const hit = cabeceras.get(clave);
  if (hit && Date.now() - hit.at < TTL_CABECERAS_MS) return hit.cabecera;
  const cabecera = await leerCabecera(a.id);
  cabeceras.set(clave, { at: Date.now(), cabecera });
  return cabecera;
}

/**
 * Cabecera de un GLB de Drive por su id, con la misma caché. Devuelve null si no
 * se pudo leer o no es un GLB válido: nunca lanza. Se exporta porque el peso y
 * los polígonos de una ficha son útiles fuera de la auditoría (p. ej. la fila de
 * datos técnicos de la galería) y no tiene sentido leerlos dos veces.
 */
export async function cabeceraGlbDe(fileId: string): Promise<CabeceraGlb | null> {
  const clave = `id:${fileId}`;
  const hit = cabeceras.get(clave);
  if (hit && Date.now() - hit.at < TTL_CABECERAS_MS) return hit.cabecera;
  try {
    const cabecera = await leerCabecera(fileId);
    cabeceras.set(clave, { at: Date.now(), cabecera });
    return cabecera;
  } catch {
    return null;
  }
}

/** Pool con límite: `Promise.all` a pelo sobre 50 modelos hace que Drive
 *  empiece a devolver 429 y la auditoría tarde más, no menos. */
async function enParalelo<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const salida = new Array<R>(items.length);
  let siguiente = 0;
  const obreros = Array.from(
    { length: Math.max(1, Math.min(limite, items.length)) },
    async () => {
      for (;;) {
        const i = siguiente++;
        if (i >= items.length) return;
        salida[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(obreros);
  return salida;
}

/* ─────────────────────────────── Auditoría ─────────────────────────────── */

type Resolucion = {
  pieza: PiezaAuditable;
  /** Archivo que la galería está sirviendo AHORA MISMO (o null si no hay nada). */
  servido: ArchivoDrive | null;
  /** Cómo se ha llegado a él: por nombre (lo normal) o por el id congelado. */
  via: "nombre" | "respaldo" | "sin-carpeta" | "nada";
  candidatos: ArchivoDrive[];
  carpeta: CarpetaDrive | null;
};

/**
 * Replica el algoritmo de `resolverFileId()` PASO POR PASO (misma clave, mismo
 * filtro de papelera, mismo orden por modifiedTime descendente, mismo respaldo
 * al driveId guardado). Si esto se desvía del resolver, la auditoría dirá que
 * todo está bien mientras la web sirve otra cosa.
 */
function resolver(pieza: PiezaAuditable, foto: FotoDrive): Resolucion {
  const fam = (pieza.fam || famDe(pieza.file)).toUpperCase();
  const carpeta = foto.ganadoraPorFam.get(fam) ?? null;
  const respaldo = pieza.driveId ? (foto.archivosPorId.get(pieza.driveId) ?? null) : null;

  if (!carpeta) {
    return {
      pieza,
      servido: respaldo,
      via: pieza.driveId ? "sin-carpeta" : "nada",
      candidatos: [],
      carpeta: null,
    };
  }

  const objetivo = claveDe(pieza.sku ?? pieza.file);
  const candidatos = (foto.archivosPorFam.get(fam) ?? [])
    .filter((a) => a.carpetaId === carpeta.id && !a.papeleraPropia)
    .filter((a) => claveDe(a.nombre) === objetivo)
    // Si hay varias copias con el mismo nombre, gana la más reciente.
    .sort((a, b) => (b.modificado ?? "").localeCompare(a.modificado ?? ""));

  if (candidatos.length) {
    return { pieza, servido: candidatos[0], via: "nombre", candidatos, carpeta };
  }
  return {
    pieza,
    servido: respaldo,
    via: pieza.driveId ? "respaldo" : "nada",
    candidatos: [],
    carpeta,
  };
}

/**
 * Archivo VIVO de la carpeta cuyo nombre se parece al que la ficha busca. Es la
 * diferencia entre "no encuentro el modelo" y "renombra este de aquí": casi
 * siempre el archivo está, con una letra de más o un "(2)" al final.
 */
function parecidoA(
  r: Resolucion,
  foto: FotoDrive,
): { archivo: ArchivoDrive; d: number } | null {
  if (!r.carpeta) return null;
  const objetivo = claveDe(r.pieza.sku ?? r.pieza.file);
  let mejor: { archivo: ArchivoDrive; d: number } | null = null;
  for (const a of foto.archivosPorFam.get(r.carpeta.fam) ?? []) {
    if (a.carpetaId !== r.carpeta.id || a.papeleraPropia || !esModelo(a)) continue;
    const d = distancia(objetivo, claveDe(a.nombre));
    if (d > 3) continue;
    if (!mejor || d < mejor.d) mejor = { archivo: a, d };
  }
  return mejor;
}

function nuevoAviso(
  tipo: TipoAviso,
  datos: Omit<Aviso, "tipo" | "gravedad"> & { gravedad?: GravedadAviso },
): Aviso {
  const { gravedad, ...resto } = datos;
  return { tipo, gravedad: gravedad ?? GRAVEDAD_POR_TIPO[tipo], ...resto };
}

/* ── Detectores baratos: solo metadatos, sin tocar el contenido de los GLB ── */

function detectarCarpetasDuplicadas(foto: FotoDrive): Aviso[] {
  const avisos: Aviso[] = [];
  const porFam = new Map<string, CarpetaDrive[]>();
  for (const c of foto.carpetas.filter((x) => !x.enPapelera)) {
    porFam.set(c.fam, [...(porFam.get(c.fam) ?? []), c]);
  }
  for (const [fam, lista] of porFam) {
    if (lista.length < 2) continue;
    const gana = foto.ganadoraPorFam.get(fam);
    avisos.push(
      nuevoAviso("carpeta-duplicada", {
        pieza: null,
        fam,
        mensaje:
          `Hay ${lista.length} carpetas para ${fam} en Drive; ahora mismo manda ` +
          `«${gana?.nombre ?? "?"}». Junta los modelos en una sola y borra las demás.`,
        detalle:
          `Carpetas: ${lista.map((c) => `«${c.nombre}»`).join(" · ")}. ` +
          `Cuál gana lo decide el orden en que Drive las lista, así que puede ` +
          `cambiar sola de un día para otro y servir los modelos de la otra.`,
        driveIds: lista.map((c) => c.id),
        enlace: gana ? enlaceCarpeta(gana.id) : undefined,
      }),
    );
  }
  return avisos;
}

function detectarNombresCruzados(foto: FotoDrive, servidos: Map<string, string>): Aviso[] {
  const avisos: Aviso[] = [];
  for (const carpeta of foto.carpetas) {
    if (!carpeta.fam) continue;
    for (const a of foto.archivosPorFam.get(carpeta.fam) ?? []) {
      if (a.carpetaId !== carpeta.id || a.enPapelera || !esModelo(a)) continue;
      const suya = famDe(a.nombre);
      if (!suya || suya === carpeta.fam) continue;
      const pieza = servidos.get(a.id) ?? null;
      avisos.push(
        nuevoAviso("nombre-de-otra-familia", {
          pieza,
          fam: carpeta.fam,
          mensaje:
            `«${a.nombre}» es de ${suya} pero está guardado en la carpeta ` +
            `${carpeta.fam}. Muévelo a la carpeta de ${suya}.`,
          detalle: pieza
            ? `Además es el archivo que la galería está sirviendo para «${pieza}»: ` +
              `esa ficha muestra el mueble equivocado.`
            : `De momento ninguna ficha lo sirve, pero puede robarle la resolución ` +
              `a una pieza de ${carpeta.fam}.`,
          driveIds: [a.id],
          enlace: enlaceArchivo(a.id),
        }),
      );
    }
  }
  return avisos;
}

function detectarSinPublicar(
  foto: FotoDrive,
  familias: string[],
  idsServidos: Set<string>,
): Aviso[] {
  const avisos: Aviso[] = [];
  for (const fam of familias) {
    for (const a of foto.archivosPorFam.get(fam) ?? []) {
      // Se miran TODAS las carpetas vivas de la familia, no solo la que gana: un
      // modelo escondido en la carpeta duplicada también está sin publicar.
      if (a.enPapelera || !esModelo(a)) continue;
      // Se compara contra el id RESUELTO, no contra el driveId del catálogo:
      // si no, salen como huérfanos todos los modelos rehechos (20 falsos
      // positivos en vez del único real).
      if (idsServidos.has(a.id)) continue;
      avisos.push(
        nuevoAviso("sin-publicar", {
          pieza: null,
          fam,
          mensaje:
            `«${a.nombre}» está en Drive pero ninguna ficha de la galería lo usa. ` +
            `Dalo de alta o bórralo.`,
          detalle: `${a.bytes != null ? fmtMB(a.bytes) : "tamaño desconocido"} · ` +
            `modificado el ${fmtFecha(a.modificado)} · carpeta «${a.carpetaNombre}»`,
          driveIds: [a.id],
          enlace: enlaceArchivo(a.id),
        }),
      );
    }
  }
  return avisos;
}

/* ─────────────────────────── Orquestador público ─────────────────────────── */

let informeCache: { at: number; clave: string; informe: InformeAvisos } | null = null;

/** Vacía todas las cachés de la auditoría. Colgar del mismo sitio que el
 *  `invalidar()` del resolver (el botón "↻ Actualizar desde Drive"). */
export function invalidarAvisos(): void {
  fotoCache = null;
  informeCache = null;
  cabeceras.clear();
}

function montarInforme(piezas: number, avisos: Aviso[], parcial: boolean): InformeAvisos {
  const resumen = Object.fromEntries(TIPOS_AVISO.map((t) => [t, 0])) as Record<
    TipoAviso,
    number
  >;
  for (const a of avisos) resumen[a.tipo]++;
  avisos.sort(
    (a, b) =>
      ORDEN_GRAVEDAD[a.gravedad] - ORDEN_GRAVEDAD[b.gravedad] ||
      a.fam.localeCompare(b.fam) ||
      (a.pieza ?? "").localeCompare(b.pieza ?? "") ||
      a.tipo.localeCompare(b.tipo),
  );
  return {
    generadoEn: new Date().toISOString(),
    piezas,
    archivosRevisados: 0,
    avisos,
    resumen,
    parcial,
  };
}

/**
 * Audita el catálogo contra Drive y devuelve el informe completo.
 * NO lanza nunca: los fallos salen como avisos `error-drive` y `parcial: true`.
 */
export async function auditarNorthdeco(
  opciones: OpcionesAuditoria = {},
): Promise<InformeAvisos> {
  const { piezas: inyectadas, conCabeceras = true, refrescar = false } = opciones;

  // Solo se cachea el informe por defecto: con un catálogo inyectado no se sabe
  // si es el mismo de la llamada anterior.
  const cacheable = !inyectadas;
  const claveCache = conCabeceras ? "con-cabeceras" : "sin-cabeceras";
  if (
    cacheable &&
    !refrescar &&
    informeCache &&
    informeCache.clave === claveCache &&
    Date.now() - informeCache.at < TTL_INFORME_MS
  ) {
    return informeCache.informe;
  }

  const piezas = inyectadas ?? manifestDelRepo();

  if (!creds) {
    // Sin credenciales no hay nada que comparar; se dice y se sale en paz.
    return montarInforme(
      piezas.length,
      [
        nuevoAviso("error-drive", {
          gravedad: "alta",
          pieza: null,
          fam: "",
          mensaje:
            "No se puede auditar: falta GOOGLE_SERVICE_ACCOUNT_JSON, así que no " +
            "hay forma de mirar qué hay en Drive.",
        }),
      ],
      true,
    );
  }
  if (!piezas.length) {
    return montarInforme(
      0,
      [
        nuevoAviso("error-drive", {
          gravedad: "alta",
          pieza: null,
          fam: "",
          mensaje:
            "El catálogo llegó vacío (¿manifest.json ilegible?): no hay nada que auditar.",
        }),
      ],
      true,
    );
  }

  const avisos: Aviso[] = [];
  const familias = [
    ...new Set(piezas.map((p) => (p.fam || famDe(p.file)).toUpperCase()).filter(Boolean)),
  ];

  const foto = await fotografiarDrive(familias, refrescar);
  for (const e of foto.errores) {
    avisos.push(
      nuevoAviso("error-drive", {
        gravedad: e.fam ? "media" : "alta",
        pieza: null,
        fam: e.fam,
        mensaje: e.fam
          ? `No se pudo leer la carpeta ${e.fam} en Drive: sus piezas quedan sin auditar.`
          : `No se pudo listar la carpeta NORTHDECO de Drive: el informe está vacío, no limpio.`,
        detalle: e.motivo,
      }),
    );
  }

  /* ── Resolución pieza a pieza (lo que la galería sirve de verdad) ── */
  const resoluciones = piezas.map((p) => resolver(p, foto));
  const idsServidos = new Set<string>();
  const piezaPorId = new Map<string, string>();
  for (const r of resoluciones) {
    if (!r.servido) continue;
    idsServidos.add(r.servido.id);
    if (!piezaPorId.has(r.servido.id)) piezaPorId.set(r.servido.id, r.pieza.file);
  }

  // Un driveId de respaldo puede vivir fuera de la carpeta de su familia (o en
  // otra unidad): en ese caso hay que preguntarle a Drive uno a uno si está en
  // la papelera, que es justo el caso que la galería no detecta.
  const sueltos = [
    ...new Set(
      resoluciones
        .filter((r) => !r.servido && r.pieza.driveId)
        .map((r) => r.pieza.driveId as string),
    ),
  ];
  if (sueltos.length) {
    const extra = await enParalelo(sueltos, CONCURRENCIA_CABECERAS, metadatosDe);
    extra.forEach((a, i) => {
      if (!a) return;
      foto.archivosPorId.set(sueltos[i], a);
    });
    for (const r of resoluciones) {
      if (r.servido || !r.pieza.driveId) continue;
      const a = foto.archivosPorId.get(r.pieza.driveId);
      if (a) {
        r.servido = a;
        idsServidos.add(a.id);
        if (!piezaPorId.has(a.id)) piezaPorId.set(a.id, r.pieza.file);
      }
    }
  }

  const pesoPorId = new Map<string, Aviso>();
  for (const r of resoluciones) {
    const fam = (r.pieza.fam || famDe(r.pieza.file)).toUpperCase();
    const etiqueta = r.pieza.sku ?? r.pieza.file;

    /* sin-archivo: la búsqueda por nombre no encontró nada y la galería está
       tirando del id congelado (o de nada). */
    if (r.via !== "nombre") {
      const parecido = parecidoA(r, foto);
      // La errata puede estar en el nombre del archivo O en el SKU de la ficha,
      // así que se ofrecen las dos salidas en vez de mandar renombrar a ciegas.
      const pista = parecido
        ? ` En la carpeta hay «${parecido.archivo.nombre}», que difiere en ` +
          `${parecido.d} carácter${parecido.d === 1 ? "" : "es"}: o corriges el SKU de ` +
          `la ficha, o renombras el archivo para que coincidan exactamente.`
        : "";
      const desenlace = r.servido
        ? "la galería está sirviendo el id congelado del catálogo, que puede ser una " +
          "versión vieja"
        : "la ficha se queda sin modelo (tampoco hay id de respaldo)";
      avisos.push(
        nuevoAviso("sin-archivo", {
          pieza: r.pieza.file,
          fam,
          mensaje:
            r.via === "sin-carpeta"
              ? `No existe la carpeta ${fam} en Drive, así que «${etiqueta}» no se puede ` +
                `resolver por nombre: ${desenlace}.`
              : `No hay ningún archivo llamado «${etiqueta}» en la carpeta ${fam}: ` +
                `${desenlace}.${pista}`,
          detalle: r.servido
            ? `Sirviendo «${r.servido.nombre}» (${fmtFecha(r.servido.modificado)})` +
              (r.servido.enPapelera ? " — Y ESTÁ EN LA PAPELERA." : "")
            : `Y no hay ni siquiera un id de respaldo: esta ficha no muestra modelo.`,
          driveIds: r.servido ? [r.servido.id] : [],
          enlace: r.servido ? enlaceArchivo(r.servido.id) : undefined,
        }),
      );
    }

    /* archivo-en-papelera: lo que se sirve AHORA está en la papelera. Drive lo
       entrega igual por id, por eso no salta ningún error. */
    if (r.servido?.enPapelera) {
      avisos.push(
        nuevoAviso("archivo-en-papelera", {
          pieza: r.pieza.file,
          fam,
          mensaje:
            `La galería está sirviendo «${r.servido.nombre}», que está EN LA PAPELERA ` +
            `de Drive. Restáuralo o sube el modelo bueno a la carpeta ${fam}.`,
          detalle:
            (r.servido.papeleraPropia
              ? "El archivo está en la papelera"
              : `Su carpeta «${r.servido.carpetaNombre}» está en la papelera`) +
            `. Drive sirve un archivo por id aunque esté borrado, así que el cliente ` +
            `lo ve sin que nada falle.`,
          driveIds: [r.servido.id],
          enlace: enlaceArchivo(r.servido.id),
        }),
      );
    }

    /* respaldo-en-papelera: hoy salva el nombre, pero el id congelado apunta a
       la papelera. Si un día falla el listado de Drive, se sirve eso. */
    const respaldo = r.pieza.driveId ? foto.archivosPorId.get(r.pieza.driveId) : null;
    if (
      r.via === "nombre" &&
      respaldo &&
      respaldo.enPapelera &&
      respaldo.id !== r.servido?.id
    ) {
      avisos.push(
        nuevoAviso("respaldo-en-papelera", {
          pieza: r.pieza.file,
          fam,
          mensaje:
            `El id guardado en el catálogo para «${etiqueta}» apunta a un archivo de la ` +
            `papelera. Hoy no se nota porque el nombre resuelve, pero si Drive falla la ` +
            `galería servirá ese archivo borrado. Actualiza el id de la ficha.`,
          detalle: `Respaldo: «${respaldo.nombre}» (${respaldo.id}). ` +
            `Sirviendo de verdad: «${r.servido?.nombre ?? "?"}».`,
          driveIds: [respaldo.id],
          enlace: enlaceArchivo(respaldo.id),
        }),
      );
    }

    /* varios-candidatos: dos archivos vivos con el mismo nombre normalizado.
       Gana el más reciente, y eso es exactamente lo que nadie ha decidido. */
    if (r.candidatos.length > 1) {
      const [gana, ...resto] = r.candidatos;
      avisos.push(
        nuevoAviso("varios-candidatos", {
          pieza: r.pieza.file,
          fam,
          mensaje:
            `Hay ${r.candidatos.length} archivos que valen como «${etiqueta}» en la carpeta ` +
            `${fam}; se sirve el más reciente («${gana.nombre}»). Borra los que sobren.`,
          detalle: `Descartados: ${resto
            .map((c) => `«${c.nombre}» (${fmtFecha(c.modificado)})`)
            .join(" · ")}`,
          driveIds: r.candidatos.map((c) => c.id),
          enlace: enlaceArchivo(gana.id),
        }),
      );
    }

    /* peso-excesivo: el tamaño sale de los metadatos de Drive — gratis y exacto,
       sin descargar ni un byte. */
    if (r.servido?.bytes != null && r.servido.bytes > UMBRAL_PESO_BYTES) {
      const aviso = nuevoAviso("peso-excesivo", {
        pieza: r.pieza.file,
        fam,
        mensaje:
          `«${r.servido.nombre}» pesa ${fmtMB(r.servido.bytes)}: parece un export crudo sin ` +
          `comprimir (los modelos buenos pesan entre 0,4 y 3 MB). Pásalo por el compresor ` +
          `antes de que el cliente lo cargue por 4G.`,
        detalle: `Umbral: ${fmtMB(UMBRAL_PESO_BYTES)}.`,
        driveIds: [r.servido.id],
        enlace: enlaceArchivo(r.servido.id),
      });
      // Se guarda para rematarlo con el generador real cuando se lea la cabecera.
      pesoPorId.set(r.servido.id, aviso);
      avisos.push(aviso);
    }
  }

  avisos.push(...detectarCarpetasDuplicadas(foto));
  avisos.push(...detectarNombresCruzados(foto, piezaPorId));
  avisos.push(...detectarSinPublicar(foto, familias, idsServidos));

  /* ── Duplicados por bytes: mismo md5 = el mismo modelo publicado dos veces
       (la variante de color nunca se retexturizó). Sale de los metadatos. ── */
  const porMd5 = new Map<string, Resolucion[]>();
  for (const r of resoluciones) {
    if (!r.servido?.md5) continue;
    porMd5.set(r.servido.md5, [...(porMd5.get(r.servido.md5) ?? []), r]);
  }
  for (const grupo of porMd5.values()) {
    if (grupo.length < 2) continue;
    const nombres = grupo.map((g) => g.pieza.sku ?? g.pieza.file);
    for (const r of grupo) {
      avisos.push(
        nuevoAviso("geometria-duplicada", {
          pieza: r.pieza.file,
          fam: (r.pieza.fam || famDe(r.pieza.file)).toUpperCase(),
          mensaje:
            `Este modelo es BYTE A BYTE el mismo que ${nombres
              .filter((n) => n !== (r.pieza.sku ?? r.pieza.file))
              .join(", ")}: la variante no se ha retexturizado, el cliente ve el mismo ` +
            `mueble en dos fichas distintas.`,
          detalle: `Mismo md5 (${r.servido?.md5}) en ${grupo.length} fichas.`,
          driveIds: grupo.map((g) => g.servido?.id ?? "").filter(Boolean),
          enlace: r.servido ? enlaceArchivo(r.servido.id) : undefined,
        }),
      );
    }
  }

  /* ── Fase B: cabeceras (geometría y materiales) solo de lo que se sirve ── */
  const archivosRevisados = foto.archivosPorId.size;
  if (conCabeceras) {
    const aLeer = resoluciones
      .filter((r) => r.servido && esGlbBinario(r.servido))
      .map((r) => r as Resolucion & { servido: ArchivoDrive });
    const unicos = new Map<string, (typeof aLeer)[number]>();
    for (const r of aLeer) if (!unicos.has(r.servido.id)) unicos.set(r.servido.id, r);

    const leidas = await enParalelo(
      [...unicos.values()],
      CONCURRENCIA_CABECERAS,
      async (r) => {
        try {
          return { r, cabecera: await cabeceraDe(r.servido), error: null as string | null };
        } catch (e) {
          // Un GLB roto no puede tumbar la auditoría de los otros 49.
          return { r, cabecera: null, error: motivo(e) };
        }
      },
    );

    const porHuella = new Map<string, { fam: string; pieza: string; sku: string }[]>();
    for (const { r, cabecera, error } of leidas) {
      const fam = (r.pieza.fam || famDe(r.pieza.file)).toUpperCase();
      if (!cabecera) {
        avisos.push(
          nuevoAviso("archivo-ilegible", {
            pieza: r.pieza.file,
            fam,
            mensaje:
              `No se pudo leer la cabecera de «${r.servido.nombre}»: puede estar corrupto ` +
              `o no ser un GLB. Ábrelo en el visor antes de enseñárselo al cliente.`,
            detalle: error ?? undefined,
            driveIds: [r.servido.id],
            enlace: enlaceArchivo(r.servido.id),
          }),
        );
        continue;
      }

      // El tamaño solo dice que pesa; el generador dice POR QUÉ pesa. Los modelos
      // buenos salen de glTF-Transform (el compresor de casa); los de 20-40 MB
      // vienen tal cual de Blender o de Tripo.
      const avisoPeso = pesoPorId.get(r.servido.id);
      if (avisoPeso) {
        avisoPeso.detalle =
          `${avisoPeso.detalle ?? ""} Generado con ` +
          `${cabecera.generador ?? "origen desconocido"}` +
          `${cabecera.extensiones.includes("KHR_draco_mesh_compression") ? " (con Draco)" : " y SIN compresión Draco"}` +
          ` · ${fmtNum(cabecera.triangulos)} triángulos · ${fmtNum(cabecera.vertices)} vértices.`;
      }

      if (cabecera.materiales === 0) {
        avisos.push(
          nuevoAviso("sin-material", {
            pieza: r.pieza.file,
            fam,
            mensaje:
              `«${r.servido.nombre}» no tiene ningún material: es una malla cruda y en el ` +
              `visor se verá gris. Textúralo o quita la ficha de la galería.`,
            detalle:
              `${fmtNum(cabecera.vertices)} vértices · ${fmtNum(cabecera.triangulos)} triángulos · ` +
              `0 materiales · ${cabecera.imagenes} imágenes` +
              (cabecera.generador ? ` · generado con ${cabecera.generador}` : ""),
            driveIds: [r.servido.id],
            enlace: enlaceArchivo(r.servido.id),
          }),
        );
      }

      // Huella de geometría. Dentro de una misma familia es NORMAL que las
      // variantes de color compartan malla (ahí la señal buena es el md5, ya
      // comprobado arriba); solo es anomalía si se repite ENTRE familias.
      if (cabecera.vertices > 0) {
        const huella = `${cabecera.vertices}:${cabecera.triangulos}:${cabecera.primitivas}:${cabecera.nodos}`;
        porHuella.set(huella, [
          ...(porHuella.get(huella) ?? []),
          { fam, pieza: r.pieza.file, sku: r.pieza.sku ?? r.pieza.file },
        ]);
      }
    }

    for (const [huella, grupo] of porHuella) {
      const familiasDelGrupo = new Set(grupo.map((g) => g.fam));
      if (familiasDelGrupo.size < 2) continue;
      for (const g of grupo) {
        const otros = grupo.filter((x) => x.fam !== g.fam).map((x) => x.sku);
        avisos.push(
          nuevoAviso("geometria-duplicada", {
            pieza: g.pieza,
            fam: g.fam,
            mensaje:
              `Tiene exactamente la misma geometría que ${otros.join(", ")}, que son ` +
              `productos de otra familia. O es el mismo mueble subido dos veces, o se ha ` +
              `copiado el GLB equivocado.`,
            detalle: `Huella vértices:triángulos:primitivas:nodos = ${huella}`,
          }),
        );
      }
    }
  }

  const informe = montarInforme(
    piezas.length,
    avisos,
    avisos.some((a) => a.tipo === "error-drive"),
  );
  informe.archivosRevisados = archivosRevisados;
  if (cacheable) informeCache = { at: Date.now(), clave: claveCache, informe };
  return informe;
}

/** Atajo: solo la lista de avisos, ya ordenada por gravedad. */
export async function avisosNorthdeco(
  opciones: OpcionesAuditoria = {},
): Promise<Aviso[]> {
  return (await auditarNorthdeco(opciones)).avisos;
}
