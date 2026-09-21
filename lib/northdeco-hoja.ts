import { JWT } from "google-auth-library";
import { parseServiceAccount } from "./google-credentials";
import type { EstadoFamilia } from "./northdeco-carpetas";

/**
 * LA HOJA DE SEGUIMIENTO de NorthDeco, la que mira el equipo para saber qué
 * queda por validar. Es la misma información que el color de la carpeta de
 * Drive, pero en una lista con todos los SKU: aquí solo se escribe la COLUMNA A.
 *
 *   "FALTA VALIDAR"  la carpeta del producto está en 🟨 y el cliente todavía
 *                    no ha dado el visto bueno a todas sus variantes
 *   "DONE"           la carpeta está en 🟩: producto validado entero
 *
 * LO QUE NO SE PISA. Las notas que escribe el equipo ("SOLO MALLA" mientras no
 * hay textura, "MAL" cuando algo falla, "NO") se quedan donde están mientras el
 * producto siga pendiente: dicen más que un "falta validar". En cuanto el
 * cliente valida el producto entero sí se sustituyen por "DONE", porque
 * entonces la nota se ha quedado vieja. El resto de columnas (el conteo, la
 * familia, el listado de SKU, el enlace, la categoría y el DONE de siempre) no
 * se tocan nunca.
 *
 * UNA FILA POR SKU, UNA MARCA POR FAMILIA. La hoja repite la familia en la
 * columna C solo en su primera fila y deja las siguientes en blanco; la marca
 * de la columna A va en esa primera fila, que es donde el equipo la lee.
 *
 * Con `NORTHDECO_HOJA_ID` vacío no hace nada: el resto del flujo (el color de
 * la carpeta) sigue funcionando igual.
 */

/**
 * Hoja "Northdeco & InSiti" en el Drive del dueño, compartida con la cuenta de
 * servicio como editor. El id va aquí como valor por defecto, igual que el de
 * la carpeta de Drive: no es un secreto y sin él habría que tocar Railway para
 * que esto funcione.
 */
const HOJA =
  process.env.NORTHDECO_HOJA_ID ?? "18CJgFmEpCBvwvXKGaBhEJ2biPzhTmE2aDDePbcFu9dQ";
const PENDIENTE = "FALTA VALIDAR";
const VALIDADO = "DONE";
/** Lo que escribe el equipo a mano y aquí no se pisa. */
const A_MANO = ["SOLO MALLA", "MAL", "NO"];

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

async function cabeceras(): Promise<Record<string, string>> {
  const jwt = new JWT({
    email: creds!.client_email,
    key: creds!.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const { token } = await jwt.getAccessToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface CambioEnHoja {
  fila: number;
  fam: string;
  antes: string;
  despues: string;
}

/**
 * Pone al día la columna A con el estado de cada familia. Devuelve los cambios
 * que ha hecho (o que haría, con `simular`).
 */
export async function sincronizarHoja(
  estados: Map<string, EstadoFamilia>,
  opciones: { simular?: boolean } = {},
): Promise<CambioEnHoja[]> {
  if (!HOJA || !creds) return [];
  const cab = await cabeceras();
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${HOJA}`;
  const r = await fetch(`${api}/values/A1:C1000`, { headers: cab });
  if (!r.ok) throw new Error(`hoja: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const filas: string[][] = (await r.json()).values ?? [];

  const cambios: CambioEnHoja[] = [];
  const columna: string[][] = filas.map((f) => [f[0] ?? ""]);
  for (let i = 1; i < filas.length; i++) {
    const fam = (filas[i][2] ?? "").trim().toUpperCase();
    if (!fam) continue; // fila de variante: la marca va en la primera de la familia
    const estado = estados.get(fam);
    if (!estado) continue; // familia que no está publicada: no es asunto nuestro
    const antes = (filas[i][0] ?? "").trim();
    const despues = estado === "validada" ? VALIDADO : PENDIENTE;
    // Una nota del equipo ("SOLO MALLA" mientras no hay textura, "MAL" cuando
    // algo falla) manda sobre el amarillo, que no dice nada que ella no diga.
    // El verde SI la pisa: si el cliente ha validado las piezas, la nota se ha
    // quedado vieja y lo que hay que ver es que el producto está cerrado.
    if (despues === PENDIENTE && A_MANO.includes(antes.toUpperCase())) continue;
    if (antes === despues) continue;
    columna[i] = [despues];
    cambios.push({ fila: i + 1, fam, antes, despues });
  }
  if (!cambios.length || opciones.simular) return cambios;

  const w = await fetch(`${api}/values/A1?valueInputOption=RAW`, {
    method: "PUT",
    headers: cab,
    body: JSON.stringify({ values: columna }),
  });
  if (!w.ok) throw new Error(`hoja: ${w.status} ${(await w.text()).slice(0, 200)}`);
  return cambios;
}

/**
 * LOS SKU QUE ENTRAN EN LA GALERÍA, que son los de la hoja y nadie más.
 *
 * POR QUÉ. La galería publica sola todo GLB que aparezca en una carpeta 🟨, y
 * en Drive hay variantes de color de los mismos productos que nadie ha pedido
 * revisar: el panel decía 235 donde la hoja dice 159 (la Maestro gris y
 * amarilla, la Elon rosa nude, el taburete Tolik beige...). La hoja es la
 * lista de trabajo acordada, así que es ella la que dice qué se enseña; Drive
 * sigue diciendo en qué estado está cada cosa.
 *
 * Por clave laxa, que la hoja escribe "ND-0112- TY-113" y el archivo se llama
 * "ND-0112-TY-113.glb".
 *
 * Si la hoja no se puede leer devuelve null y la galería no filtra: mejor
 * enseñar de más un rato que dejar al cliente con la página en blanco.
 */
const TTL_MS = 5 * 60_000;
let cache: { at: number; skus: Set<string> } | null = null;

/** Igual que normalizarClave del catálogo, aquí para no cruzar los dos módulos. */
const laxa = (s: string): string =>
  s
    .toUpperCase()
    .replace(/\.GLB$/, "")
    .replace(/[^A-Z0-9]/g, "");

export async function skusDeLaHoja(): Promise<Set<string> | null> {
  if (!HOJA || !creds) return null;
  if (cache && Date.now() - cache.at < TTL_MS) return cache.skus;
  try {
    const cab = await cabeceras();
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${HOJA}/values/D1:D1000`,
      { headers: cab },
    );
    if (!r.ok) throw new Error(`${r.status}`);
    const filas: string[][] = (await r.json()).values ?? [];
    const skus = new Set<string>();
    for (const [sku] of filas.slice(1)) if (sku?.trim()) skus.add(laxa(sku.trim()));
    if (!skus.size) return null;
    cache = { at: Date.now(), skus };
    return skus;
  } catch (err) {
    console.error("[northdeco-hoja] no se pudo leer la lista:", err);
    return cache?.skus ?? null;
  }
}
