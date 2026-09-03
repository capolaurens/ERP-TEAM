import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";
import { resolverFileId } from "./northdeco-resolver";
import { extractDriveFileId } from "./drive";

/**
 * Ficha TÉCNICA de una pieza de la galería Northdeco: nombre real en Drive,
 * peso, fechas, geometría (vértices / mallas / triángulos) y el `generator` del
 * glTF — que es lo que delata si el modelo salió de Tripo/Meshy (IA) o de
 * Blender (hecho a mano).
 *
 * Por qué existe: la metadata de Drive da peso y fechas, pero NO la geometría
 * ni el generador; eso vive dentro del archivo. Y descargar los 50 GLB para
 * mirarlos son ~1 GB, así que al vuelo es inviable. La salida es leer solo la
 * CABECERA por Range HTTP: un GLB es [12 bytes de cabecera][chunk JSON][chunk
 * BIN], el chunk JSON va SIEMPRE primero y ahí está toda la información
 * declarativa. Medido en producción: 10 KB leídos en lugar de 20 MB.
 *
 * Las texturas, que son el 95% del peso, no se bajan NUNCA.
 */

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Cliente único: GoogleAuth cachea y renueva el token por dentro. Crear uno por
// pieza haría que cada Range pidiera su propio token, y con el lote entero a la
// vez esa ráfaga contra oauth2.googleapis.com acaba en ETIMEDOUT (es el mismo
// motivo por el que lib/drive.ts cachea el suyo).
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

/* ------------------------------------------------------------------ tipos -- */

/**
 * Qué herramienta escribió el archivo, deducido del `asset.generator`.
 *
 * OJO con lo que esto significa: el generator delata la ÚLTIMA herramienta que
 * guardó el GLB, no de dónde salió la geometría. Solo "ia" es una señal fuerte
 * (nadie exporta desde Tripo por accidente); las otras tres no descartan que la
 * malla sea generada.
 *  - "ia"          → Tripo, Meshy y compañía: malla generada automáticamente.
 *  - "editor"      → Blender, Maya, 3ds Max…: pasó por un editor de escritorio.
 *                    NO significa "hecho a mano": una malla de Tripo importada
 *                    en Blender y reexportada declara exactamente esto.
 *  - "comprimido"  → pasó por nuestro compresor (glTF-Transform), que REESCRIBE
 *                    el generator: a partir de ahí el rastro del origen ya no
 *                    consta en el archivo.
 *  - "desconocido" → sin generator o con uno que no reconocemos.
 *
 * Para distinguir de verdad IA de trabajo manual, el generator hay que leerlo
 * junto a la geometría: las mallas de IA salen con cientos de miles de
 * triángulos en UNA primitiva y un solo material.
 */
export type OrigenModelo = "ia" | "editor" | "comprimido" | "desconocido";

export type DatosTecnicos = {
  /** Lo que se pidió: clave del manifest ("ND-0602-WALNUT-BLACK.glb") o fileId. */
  clave: string;
  /** Id VIGENTE en Drive (el que resuelve el resolver), no el congelado del manifest. */
  driveId: string | null;
  /** Nombre real del archivo en Drive ("ND-0602 - WALNUT-BLACK.glb"). */
  nombre: string | null;
  /** Peso en bytes, según la API de Drive. */
  bytes: number | null;
  /** Última modificación (ISO). Es el dato útil para "¿esto está rehecho?". */
  modificado: string | null;
  /** Subida original (ISO). Ojo: no coincide con `modificado` si se resubió. */
  creado: string | null;
  /** Se está sirviendo un archivo que está en la PAPELERA (Drive lo entrega igual). */
  enPapelera: boolean | null;
  /** Huella de contenido de Drive: si cambia, el archivo cambió de verdad. */
  md5: string | null;
  vertices: number | null;
  triangulos: number | null;
  /** Nº de meshes del glTF. */
  mallas: number | null;
  /** Nº de primitivas (un mesh puede tener varias). */
  primitivas: number | null;
  materiales: number | null;
  imagenes: number | null;
  /** `asset.generator` tal cual ("Khronos glTF Blender I/O v5.1.19"). */
  generador: string | null;
  origen: OrigenModelo;
  /** Pasó por el compresor de casa (generator glTF-Transform o malla en Draco). */
  comprimido: boolean | null;
  extensiones: string[];
  /** Enlace para abrirlo en Drive. Ojo: el cliente NO tiene acceso a la unidad. */
  enlace: string | null;
  /** Motivo del fallo si algo no se pudo leer; null si la ficha está completa. */
  error: string | null;
};

/** Enlace canónico para abrir un archivo de Drive en el navegador. */
export function enlaceDrive(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/* ------------------------------------------------------------------ cachés -- */

// La ficha entera caduca a los 5 min, el mismo horizonte que la caché de
// carpetas del resolver: así toda el área envejece a la vez y no se dan datos
// de dos épocas distintas en la misma pantalla.
const TTL_FICHA_MS = 5 * 60_000;
// Un fallo se recuerda mucho menos: si alguien arregla el archivo en Drive, la
// ficha tiene que recuperarse sola en un minuto, no en cinco.
const TTL_ERROR_MS = 60_000;

const fichas = new Map<string, { at: number; datos: DatosTecnicos }>();

// La cabecera se cachea por `${driveId}@${modifiedTime}`: si el archivo cambia,
// cambia la clave y la entrada vieja deja de consultarse sola. Por eso NO lleva
// TTL — nunca puede quedarse obsoleta. Solo se acota el tamaño para que un
// proceso largo no se coma la memoria.
const MAX_CABECERAS = 500;
const cabeceras = new Map<string, Cabecera>();

/** Vacía las cachés técnicas. Colgar del mismo botón "↻ Actualizar desde Drive". */
export function invalidarTecnico(clave?: string): void {
  if (clave) {
    fichas.delete(clave);
    return;
  }
  fichas.clear();
  cabeceras.clear();
}

/* -------------------------------------------------------- cabecera del GLB -- */

const GLB_MAGIC = 0x46546c67; // "glTF" en little-endian
const CHUNK_JSON = 0x4e4f534a; // "JSON"
// Tope defensivo: si el uint32 de longitud viene corrupto (o el archivo no es
// un GLB), sin este límite pediríamos un Range absurdo y nos bajaríamos medio
// Drive. Los chunks JSON reales de este catálogo rondan 1-10 KB.
const MAX_JSON_BYTES = 32 * 1024 * 1024;

type Cabecera = {
  generador: string | null;
  mallas: number;
  primitivas: number;
  vertices: number;
  triangulos: number;
  materiales: number;
  imagenes: number;
  extensiones: string[];
};

/** Vista PARCIAL del glTF: solo lo que se lee aquí, para no usar `any`. */
type GltfAccessor = { count?: number };
type GltfPrimitive = { attributes?: Record<string, number>; indices?: number };
type GltfMesh = { primitives?: GltfPrimitive[] };
type GltfJson = {
  asset?: { generator?: string; version?: string };
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  materials?: unknown[];
  images?: unknown[];
  extensionsUsed?: string[];
};

/** Normaliza lo que devuelva gaxios con responseType "arraybuffer". */
function aBuffer(datos: unknown): Buffer {
  if (Buffer.isBuffer(datos)) return datos;
  if (datos instanceof ArrayBuffer) return Buffer.from(datos);
  if (ArrayBuffer.isView(datos)) {
    return Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  }
  if (typeof datos === "string") return Buffer.from(datos, "binary");
  throw new Error("respuesta de Drive con un tipo inesperado");
}

/** Pide un rango de bytes concreto del archivo (Drive responde 206). */
async function rango(fileId: string, desde: number, hasta: number) {
  const r = await cliente().files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    {
      responseType: "arraybuffer",
      headers: { Range: `bytes=${desde}-${hasta}` },
    },
  );
  return aBuffer(r.data as unknown);
}

/**
 * Lee la cabecera de un GLB con DOS peticiones Range:
 *   1) bytes 0-19  → magic, versión, longitud total, longitud del chunk JSON
 *                    (uint32 LE en el offset 12) y tipo de chunk (offset 16).
 *   2) bytes 20..  → exactamente el chunk JSON, que se parsea.
 * El chunk BIN (las texturas) no se toca.
 */
async function leerCabecera(fileId: string): Promise<Cabecera> {
  const inicio = await rango(fileId, 0, 19);
  if (inicio.byteLength < 20) {
    throw new Error("archivo demasiado corto para ser un GLB");
  }
  if (inicio.readUInt32LE(0) !== GLB_MAGIC) {
    // Un .gltf suelto (JSON + .bin aparte) cae aquí: no tiene cabecera binaria.
    throw new Error("no es un GLB binario (magic incorrecto)");
  }
  const jsonLen = inicio.readUInt32LE(12);
  if (inicio.readUInt32LE(16) !== CHUNK_JSON) {
    throw new Error("el primer chunk no es JSON");
  }
  if (jsonLen === 0 || jsonLen > MAX_JSON_BYTES) {
    throw new Error(`longitud de chunk JSON inverosímil (${jsonLen})`);
  }

  // Si Drive ignorase el Range y devolviera el archivo entero, ya tendríamos el
  // chunk en la mano: no repetimos la petición. Vale también para GLB diminutos.
  const yaLoTengo = inicio.byteLength >= 20 + jsonLen;
  const bruto = yaLoTengo
    ? inicio.subarray(20, 20 + jsonLen)
    : await rango(fileId, 20, 19 + jsonLen);
  if (bruto.byteLength < jsonLen) {
    throw new Error(
      `chunk JSON truncado (${bruto.byteLength} de ${jsonLen} bytes)`,
    );
  }

  // El chunk JSON va rellenado por la derecha (espacios según la spec, NUL en
  // algunos exportadores): hay que quitarlo o JSON.parse revienta.
  const texto = bruto.toString("utf8").replace(/[\s\0]+$/, "");
  const crudo: unknown = JSON.parse(texto);
  if (!crudo || typeof crudo !== "object") {
    throw new Error("el chunk JSON no contiene un objeto glTF");
  }
  const gltf = crudo as GltfJson;

  const mallas = Array.isArray(gltf.meshes) ? gltf.meshes : [];
  const accessors = Array.isArray(gltf.accessors) ? gltf.accessors : [];

  // Mismo conteo que countTris/countVerts de lib/compressor/mesh-simplify.ts,
  // para que estos números cuadren con los que reporta el compresor. Con Draco
  // los `count` siguen estando en los accessors, así que la cuenta aguanta
  // igual sobre un modelo ya comprimido (verificado sobre ND-0606).
  let vertices = 0;
  let triangulos = 0;
  let primitivas = 0;
  for (const malla of mallas) {
    for (const prim of malla.primitives ?? []) {
      primitivas++;
      const pos = accessors[prim.attributes?.POSITION ?? -1]?.count ?? 0;
      vertices += pos;
      if (prim.indices != null) {
        triangulos += (accessors[prim.indices]?.count ?? 0) / 3;
      } else {
        triangulos += pos / 3;
      }
    }
  }

  const extensiones = Array.isArray(gltf.extensionsUsed)
    ? gltf.extensionsUsed.filter((e): e is string => typeof e === "string")
    : [];

  return {
    generador:
      typeof gltf.asset?.generator === "string" ? gltf.asset.generator : null,
    mallas: mallas.length,
    primitivas,
    vertices,
    triangulos: Math.round(triangulos),
    materiales: Array.isArray(gltf.materials) ? gltf.materials.length : 0,
    imagenes: Array.isArray(gltf.images) ? gltf.images.length : 0,
    extensiones,
  };
}

/* ----------------------------------------------------------------- origen -- */

// Generadores de malla por IA vistos (o esperables) en este pipeline. La lista
// se amplía a mano: es preferible marcar "desconocido" a colar un falso "editor".
const GENERADORES_IA = [
  /tripo/i,
  /meshy/i,
  /hunyuan/i,
  /rodin/i,
  /trellis/i,
  /kaedim/i,
  /sloyd/i,
  /alpha3d/i,
  /luma\s*ai/i,
];
const GENERADORES_EDITOR = [
  /blender/i,
  /maya/i,
  /3ds\s*max/i,
  /sketchup/i,
  /cinema\s*4d/i,
  /substance/i,
  /houdini/i,
  /rhino/i,
];

function clasificar(generador: string | null): OrigenModelo {
  if (!generador) return "desconocido";
  if (GENERADORES_IA.some((re) => re.test(generador))) return "ia";
  // glTF-Transform va DESPUÉS de la IA a propósito: nuestro compresor reescribe
  // el generator, así que si aparece es que el rastro original ya se perdió.
  if (/gltf-transform|gltf-pipeline|meshopt/i.test(generador)) {
    return "comprimido";
  }
  if (GENERADORES_EDITOR.some((re) => re.test(generador))) return "editor";
  return "desconocido";
}

/* ------------------------------------------------------------------ ficha -- */

/** Ficha con todo a null: base común de los casos de fallo y del camino feliz. */
function vacia(clave: string, error: string | null): DatosTecnicos {
  return {
    clave,
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
    error,
  };
}

/**
 * Averigua a qué archivo de Drive apunta `clave`, que puede ser:
 *   - la clave `file` de una pieza del manifest → se resuelve EN VIVO por
 *     nombre (nunca se usa el driveId congelado: existe precisamente porque
 *     puede apuntar a una versión vieja o a la papelera), o
 *   - un fileId de Drive pelado → se usa tal cual.
 */
async function idDe(clave: string): Promise<string | null> {
  const resuelto = await resolverFileId(clave);
  if (resuelto) return resuelto;
  return extractDriveFileId(clave);
}

async function calcular(clave: string): Promise<DatosTecnicos> {
  if (!creds) return vacia(clave, "Drive no está configurado");

  const driveId = await idDe(clave);
  if (!driveId) return vacia(clave, "pieza desconocida (ni clave ni fileId)");

  const meta = await cliente().files.get({
    fileId: driveId,
    fields: "id,name,size,modifiedTime,createdTime,trashed,md5Checksum",
    supportsAllDrives: true,
  });
  const d = meta.data;
  const modificado = d.modifiedTime ?? null;

  const ficha: DatosTecnicos = {
    ...vacia(clave, null),
    driveId,
    nombre: d.name ?? null,
    // `size` llega como string; Number() y no BigInt, porque NextResponse.json()
    // no sabe serializar BigInt y reventaría el endpoint que use esto.
    bytes: d.size != null ? Number(d.size) : null,
    modificado,
    creado: d.createdTime ?? null,
    enPapelera: d.trashed ?? null,
    md5: d.md5Checksum ?? null,
    enlace: enlaceDrive(driveId),
    error: null,
  };

  // La cabecera es lo caro (2 Range ≈ 3 s), así que se cachea por contenido.
  const llave = `${driveId}@${modificado ?? "?"}`;
  let cab = cabeceras.get(llave);
  if (!cab) {
    cab = await leerCabecera(driveId);
    if (cabeceras.size >= MAX_CABECERAS) {
      const masVieja = cabeceras.keys().next().value;
      if (masVieja !== undefined) cabeceras.delete(masVieja);
    }
    cabeceras.set(llave, cab);
  }

  return {
    ...ficha,
    vertices: cab.vertices,
    triangulos: cab.triangulos,
    mallas: cab.mallas,
    primitivas: cab.primitivas,
    materiales: cab.materiales,
    imagenes: cab.imagenes,
    generador: cab.generador,
    origen: clasificar(cab.generador),
    comprimido:
      /gltf-transform|meshopt/i.test(cab.generador ?? "") ||
      cab.extensiones.includes("KHR_draco_mesh_compression"),
    extensiones: cab.extensiones,
  };
}

/**
 * Ficha técnica de UNA pieza. Nunca lanza: si algo falla (Drive caído, archivo
 * corrupto, pieza inexistente) devuelve los campos a null y el motivo en
 * `error`, porque esto alimenta pantallas donde un dato accesorio jamás puede
 * tumbar la página.
 */
export async function datosTecnicos(clave: string): Promise<DatosTecnicos> {
  const cacheado = fichas.get(clave);
  if (cacheado) {
    const ttl = cacheado.datos.error ? TTL_ERROR_MS : TTL_FICHA_MS;
    if (Date.now() - cacheado.at < ttl) return cacheado.datos;
  }

  let datos: DatosTecnicos;
  try {
    datos = await calcular(clave);
  } catch (e) {
    console.error(`[northdeco-tecnico] ${clave}:`, e);
    datos = vacia(clave, e instanceof Error ? e.message : String(e));
  }
  fichas.set(clave, { at: Date.now(), datos });
  return datos;
}

/**
 * Igual pero para muchas piezas, con un pool de concurrencia fija: un
 * `Promise.all` a pelo sobre 50 piezas son ~150 peticiones simultáneas a Drive
 * y acaba en 403 de cuota o en ETIMEDOUT. Con 8 en paralelo el catálogo entero
 * se lee en ~20 s en frío y al instante en caliente.
 *
 * Devuelve un Map por clave, con una entrada por cada clave pedida (las que
 * fallen traen su `error` relleno, no desaparecen).
 */
export async function datosTecnicosLote(
  claves: string[],
  opciones: { concurrencia?: number } = {},
): Promise<Map<string, DatosTecnicos>> {
  const concurrencia = Math.max(1, Math.min(opciones.concurrencia ?? 8, 16));
  // Sin duplicados: dos fichas del manifest pueden apuntar al mismo archivo.
  const unicas = [...new Set(claves)];
  const salida = new Map<string, DatosTecnicos>();

  let siguiente = 0;
  const obreros = Array.from(
    { length: Math.min(concurrencia, unicas.length) },
    async () => {
      for (;;) {
        const i = siguiente++;
        if (i >= unicas.length) return;
        // datosTecnicos ya absorbe sus propios errores, así que ningún obrero
        // puede rechazar y dejar el lote a medias.
        salida.set(unicas[i], await datosTecnicos(unicas[i]));
      }
    },
  );
  await Promise.all(obreros);

  return salida;
}
