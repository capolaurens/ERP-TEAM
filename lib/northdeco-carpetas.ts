import { drive as driveApi, auth as googleAuth } from "@googleapis/drive";
import { parseServiceAccount } from "./google-credentials";
import { famDe, leerGaleria } from "./northdeco-catalogo";
import { revisionPorFile } from "./northdeco-estado";

/**
 * EL COLOR DE LA CARPETA DE DRIVE, que es lo que ve el cliente cuando entra en
 * su carpeta compartida y lo que lee la hoja de seguimiento:
 *
 *   "ND-XXXX 🟨"  publicado y esperando que lo valide
 *   "ND-XXXX 🟩"  ha dado el visto bueno a TODOS los 3D de ese producto
 *
 * POR QUE UNA FAMILIA ENTERA. El producto es la familia (ND-0874), no cada
 * variante: al cliente no le sirve tener validada la silla en nogal si la de
 * madera natural sigue pendiente, porque publica el producto completo. Por eso
 * la carpeta solo se pone verde cuando TODAS sus piezas publicadas estan en
 * "listo" (visto bueno y sin comentarios abiertos), que es lo mismo que pinta
 * la etiqueta de cada tarjeta en la galeria.
 *
 * LO QUE NO SE TOCA. En los nombres hay marcas que no son nuestras (🟥, 🟦):
 * las pone el equipo o el cliente y significan cosas que aqui no se saben. Se
 * conservan tal cual; esto solo cambia 🟨 por 🟩 y al reves.
 */

const CARPETA_NORTHDECO =
  process.env.NORTHDECO_DRIVE_FOLDER ?? "1uQN2kIw36jaXvSS_hY3k-EYdkXaAOAo1";

/** Las dos marcas que gestiona este modulo. El resto del nombre se respeta. */
const PENDIENTE = "🟨";
const VALIDADA = "🟩";

export type EstadoFamilia = "pendiente" | "validada";

export interface FamiliaEnDrive {
  fam: string;
  /** Piezas publicadas de la familia, por su clave `file`. */
  piezas: string[];
  /** Cuantas de ellas tienen el visto bueno del cliente. */
  validadas: number;
  estado: EstadoFamilia;
  carpetaId: string | null;
  nombreActual: string | null;
  /** Como deberia llamarse la carpeta. Igual al actual si no hay que tocar nada. */
  nombreNuevo: string | null;
}

const creds = parseServiceAccount(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

function cliente() {
  const auth = new googleAuth.GoogleAuth({
    credentials: creds!,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveApi({ version: "v3", auth });
}

/** Carpetas "ND-XXXX ..." de NORTHDECO, por familia. */
export async function carpetasDeDrive(): Promise<
  Map<string, { id: string; name: string }>
> {
  const drive = cliente();
  const porFamilia = new Map<string, { id: string; name: string }>();
  let pageToken: string | undefined;
  do {
    const r = await drive.files.list({
      q: `'${CARPETA_NORTHDECO}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id,name)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
    });
    for (const f of r.data.files ?? []) {
      const fam = (f.name?.match(/ND-\d+/i) ?? [""])[0].toUpperCase();
      if (fam && f.id) porFamilia.set(fam, { id: f.id, name: f.name ?? "" });
    }
    pageToken = r.data.nextPageToken ?? undefined;
  } while (pageToken);
  return porFamilia;
}

/**
 * El nombre que le toca a la carpeta: el mismo de ahora con nuestra marca
 * cambiada. Si ya la lleva bien, devuelve el mismo nombre.
 */
export function nombreConMarca(nombre: string, estado: EstadoFamilia): string {
  const limpio = nombre
    .replaceAll(PENDIENTE, "")
    .replaceAll(VALIDADA, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${limpio} ${estado === "validada" ? VALIDADA : PENDIENTE}`.trim();
}

/**
 * La carpeta lleva una marca que no gestionamos (hoy 🟥, que pone el equipo
 * cuando algo esta mal). Con una de esas encima, el color no se toca solo.
 */
export function llevaMarcaAjena(nombre: string): boolean {
  return /🟥/.test(nombre);
}

/** Estado de cada familia publicada, con la carpeta que le corresponde. */
export async function estadoDeLasFamilias(): Promise<FamiliaEnDrive[]> {
  // Las piezas que el cliente VE (las retiradas y las ocultas no las puede
  // validar, asi que no pueden dejar un producto en amarillo para siempre).
  const [piezas, revision, carpetas] = await Promise.all([
    leerGaleria(),
    revisionPorFile(),
    carpetasDeDrive(),
  ]);
  const porFamilia = new Map<string, string[]>();
  for (const p of piezas) {
    const fam = (p.fam || famDe(p.file)).toUpperCase();
    if (!fam) continue;
    (porFamilia.get(fam) ?? porFamilia.set(fam, []).get(fam)!).push(p.file);
  }
  return [...porFamilia.entries()]
    .map(([fam, files]) => {
      const validadas = files.filter((f) => revision[f] === "listo").length;
      const estado: EstadoFamilia =
        validadas === files.length ? "validada" : "pendiente";
      const carpeta = carpetas.get(fam) ?? null;
      return {
        fam,
        piezas: files,
        validadas,
        estado,
        carpetaId: carpeta?.id ?? null,
        nombreActual: carpeta?.name ?? null,
        nombreNuevo: carpeta ? nombreConMarca(carpeta.name, estado) : null,
      };
    })
    .sort((a, b) => a.fam.localeCompare(b.fam));
}

/**
 * Pone el color que toca en las carpetas. Con `simular` no escribe nada: lo
 * normal es mirarlo antes, que esto renombra carpetas que el cliente ve.
 *
 * `soloVerde` (el valor por defecto) solo pinta de verde lo que el cliente ya
 * ha validado y no baja nada a amarillo: una carpeta sin marca puede estar asi
 * a proposito y no somos quien para decidirlo.
 */
export async function aplicarColores(
  opciones: { simular?: boolean; soloVerde?: boolean } = {},
): Promise<{ cambios: FamiliaEnDrive[]; sinCarpeta: string[]; aMano: FamiliaEnDrive[] }> {
  const { simular = true, soloVerde = true } = opciones;
  if (!creds) throw new Error("sin GOOGLE_SERVICE_ACCOUNT_JSON: no se toca Drive");
  const familias = await estadoDeLasFamilias();
  const sinCarpeta = familias.filter((f) => !f.carpetaId).map((f) => f.fam);
  const candidatas = familias.filter(
    (f) =>
      f.carpetaId &&
      f.nombreNuevo !== f.nombreActual &&
      (!soloVerde || f.estado === "validada"),
  );
  // Una carpeta con una marca que no es nuestra (🟥) la ha pintado alguien por
  // algo que aqui no se sabe: se deja como esta y se avisa.
  const aMano = candidatas.filter((f) => llevaMarcaAjena(f.nombreActual ?? ""));
  const cambios = candidatas.filter((f) => !llevaMarcaAjena(f.nombreActual ?? ""));
  if (!simular) {
    const drive = cliente();
    for (const f of cambios) {
      await drive.files.update({
        fileId: f.carpetaId!,
        requestBody: { name: f.nombreNuevo! },
        supportsAllDrives: true,
      });
    }
  }
  return { cambios, sinCarpeta, aMano };
}

/**
 * Recalcula el color de la carpeta a la que pertenece una pieza. Es lo que se
 * llama desde el endpoint de feedback: en cuanto el cliente marca la ultima
 * variante que le faltaba, su carpeta se pone verde sola.
 */
export async function sincronizarCarpetaDe(file: string): Promise<void> {
  if (!creds) return;
  const fam = famDe(file).toUpperCase();
  if (!fam) return;
  const familias = await estadoDeLasFamilias();
  const suya = familias.find((f) => f.fam === fam);
  if (!suya?.carpetaId || suya.nombreNuevo === suya.nombreActual) return;
  // Solo se sube a verde desde aqui: bajar a amarillo en caliente haria bailar
  // el nombre de la carpeta cada vez que el cliente desmarca una casilla.
  if (suya.estado !== "validada") return;
  if (llevaMarcaAjena(suya.nombreActual ?? "")) return;
  await cliente().files.update({
    fileId: suya.carpetaId,
    requestBody: { name: suya.nombreNuevo! },
    supportsAllDrives: true,
  });
}
