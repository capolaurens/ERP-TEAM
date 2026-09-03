import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";

/**
 * MARCAS DE VISIBILIDAD de la galería /northdeco desde Drive.
 *
 * La regla de negocio: en la galería solo se ven las piezas cuya carpeta de
 * familia en NORTHDECO lleva el emoji 🟨 en el nombre ("ND-0606 🟨"). Marcar
 * una carpeta la hace aparecer (con alta automática si hace falta) y quitarle
 * el emoji la oculta, sin tocar el ERP.
 *
 * `familiasMarcadas()` hace UNA sola llamada a Drive (listar los nombres de
 * las carpetas hijas de NORTHDECO), cacheada TTL_MS. Es deliberadamente
 * independiente del escaneo del panel (25 s de lecturas): esto tiene que poder
 * correr en el render de la página pública sin dolerle a nadie.
 *
 * Sin import estático de northdeco-catalogo / northdeco-escaneo: los usa este
 * módulo con import() dinámico dentro de las funciones para no crear un ciclo
 * (northdeco-catalogo importa de aquí).
 */

export const MARCA = "🟨";

const NORTHDECO_FOLDER =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

// Cliente único, como en lib/drive.ts: GoogleAuth cachea y renueva el token.
let cliente: ReturnType<typeof driveApi> | null = null;
function drive() {
  if (!cliente) {
    cliente = driveApi({
      version: "v3",
      auth: new googleAuth.GoogleAuth({
        credentials: creds!,
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      }),
    });
  }
  return cliente;
}

// Copia de famDe() de northdeco-catalogo (sin importarla: ver nota de arriba).
const famDe = (s: string): string => (s.toUpperCase().match(/ND-\d+/) ?? [""])[0];

const TTL_MS = 60_000;
let cacheMarcas: { at: number; fams: Set<string> } | null = null;

export function invalidarMarcas(): void {
  cacheMarcas = null;
}

/**
 * Familias con carpeta marcada 🟨 en Drive.
 *
 * Devuelve `null` solo cuando NO se puede saber (Drive sin configurar, o el
 * primer listado falla y no hay caché previa): el llamador debe entonces no
 * filtrar, porque ocultarlo todo dejaría la galería del cliente en blanco.
 * Si el listado falla habiendo caché, se sirve la caché aunque esté caducada:
 * mejor marcas de hace un rato que ninguna.
 */
export async function familiasMarcadas(): Promise<Set<string> | null> {
  if (!creds) return null;
  if (cacheMarcas && Date.now() - cacheMarcas.at < TTL_MS) return cacheMarcas.fams;
  try {
    const fams = new Set<string>();
    let pageToken: string | undefined;
    do {
      const res = await drive().files.list({
        q: `'${NORTHDECO_FOLDER}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "nextPageToken, files(name)",
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        const nombre = String(f.name ?? "");
        if (nombre.includes(MARCA)) {
          const fam = famDe(nombre);
          if (fam) fams.add(fam);
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    cacheMarcas = { at: Date.now(), fams };
    return fams;
  } catch (err) {
    console.error("[northdeco-marcas] fallo listando carpetas:", err);
    return cacheMarcas?.fams ?? null;
  }
}

/* ---- Alta automática de familias marcadas sin publicar ------------------ */

// Un solo intento a la vez y como mucho uno cada 5 min: el alta pasa por
// escanearDrive("todo") (~6 s de Drive) y esto se dispara desde el render de
// la página pública. El candado evita que un F5 repetido lo convierta en coste.
const INTENTO_CADA_MS = 5 * 60_000;
let altaEnCurso = false;
let ultimoIntento = 0;

/**
 * Da de alta EN SEGUNDO PLANO las familias marcadas que no tienen ninguna
 * pieza en el catálogo (el caso "acabo de marcar una carpeta nueva"). No se
 * espera (`void sincronizarAltas(...)`): la primera visita tras marcar la
 * carpeta dispara el alta y las siguientes ya la ven publicada.
 */
export function sincronizarAltas(marcadas: Set<string>, famsEnCatalogo: Set<string>): void {
  const faltan = [...marcadas].filter((f) => !famsEnCatalogo.has(f));
  if (!faltan.length || altaEnCurso) return;
  if (Date.now() - ultimoIntento < INTENTO_CADA_MS) return;
  altaEnCurso = true;
  ultimoIntento = Date.now();

  void (async () => {
    try {
      const esc = await import("./northdeco-escaneo");
      const cat = await import("./northdeco-catalogo");
      const informe = await esc.escanearDrive({ alcance: "todo" });
      const claves = informe.sinPublicar
        .filter((c) => faltan.includes(c.fam))
        .map((c) => c.file);
      if (!claves.length) return; // carpetas marcadas pero aún sin GLB válido
      const r = await esc.publicarPiezas(claves);
      cat.invalidarCatalogo();
      console.log(
        `[northdeco-marcas] alta automática por 🟨: ${r.publicadas.length} publicadas, ` +
          `${r.reenganchadas.length} reenganchadas, ${r.fallidas.length} fallidas (${faltan.join(", ")})`,
      );
    } catch (err) {
      // p. ej. catálogo en modo manifest (publicarPiezas se niega): se queda
      // logueado y se reintenta pasado el cooldown.
      console.error("[northdeco-marcas] alta automática fallida:", err);
    } finally {
      altaEnCurso = false;
    }
  })();
}
