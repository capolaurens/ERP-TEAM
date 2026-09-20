import { prisma } from "./prisma";

/**
 * ESTADO de cada tarjeta de la galería, que es lo que pinta su etiqueta.
 *
 * Antes la etiqueta salía de la columna `status`, que nace en "listo" y que
 * nadie cambia nunca: las 265 piezas decían "Listo" y el filtro "Listos"
 * contaba lo mismo que "Todos". Ahora sale de la revisión de verdad (el visto
 * bueno y los comentarios que deja el cliente en la propia galería) y de la
 * lista de abajo.
 */

/**
 * Cristales que siguen siendo el modelo provisional que hizo el equipo a mano:
 * láminas planas sin grosor, esquinas vivas y fuera de escala. Se ven de
 * plástico y están pendientes de rehacerse por medidas con
 * `texturizador-glb/vidrio-curvado.mjs` (la Burano ND-0727, la Ona ND-0703 y la
 * Elon ND-0715 ya están rehechas y por eso no salen aquí).
 *
 * Clave laxa del `file` (normalizarClave): "ND-0112-TY-113.glb" → "ND0112TY113".
 */
export const POR_REHACER: ReadonlySet<string> = new Set([
  "ND0112TY113", // Helen
  "ND0586", // Corina
  "ND0700", // Cheval
  "ND0700GOLDENTEA",
  "ND0700SMOKE",
  "ND0700TEA",
  "ND0701", // Ottish
  "ND0728CLEAR", // Jolene
  "ND0794CLEAR", // Saura
  "ND0794GOLDENTEA",
  "ND0794GREEN",
  "ND0794SMOKE",
  "ND0794TEA",
  "ND0795CLEAR", // Tossa
  "ND0795SMOKE",
  "ND0795TEA",
  "ND0844WALNUT", // Michi Noriaki
  "ND0891CLEAR", // Olivier
  "ND0891GOLDENTEA",
  "ND0893ARISMESA36", // Aris
  "ND0893ARISMESA43",
  "ND0893ARISMESA46",
  "ND0916", // Luma
]);

/**
 * Lo que dice la etiqueta:
 *  · "listo": el cliente le ha dado el visto bueno.
 *  · "porcorregir": tiene comentarios y todavía no está marcada como rehecha.
 *  · "rehacer": es uno de los cristales provisionales de arriba.
 *  · "sinrevisar": nadie la ha mirado (o está rehecha esperando visto bueno).
 */
export type EstadoTarjeta = "listo" | "porcorregir" | "rehacer" | "sinrevisar";

/**
 * Estado de revisión por `file`, leído de la misma BD que alimenta los filtros.
 * Si la consulta falla, devuelve un mapa vacío: la galería se pinta igual y el
 * JavaScript de la página lo corrige en cuanto carga el feedback.
 */
export async function revisionPorFile(): Promise<
  Record<string, "listo" | "porcorregir">
> {
  try {
    const [reviews, comentadas] = await Promise.all([
      prisma.northdecoReview.findMany({
        select: { file: true, checked: true, fixedAt: true },
      }),
      prisma.northdecoComment.findMany({
        select: { file: true },
        distinct: ["file"],
      }),
    ]);
    const conComentario = new Set(comentadas.map((c) => c.file));
    const rehechas = new Map(reviews.map((r) => [r.file, !!r.fixedAt]));
    const out: Record<string, "listo" | "porcorregir"> = {};
    for (const r of reviews) if (r.checked) out[r.file] = "listo";
    for (const file of conComentario) {
      if (out[file] === "listo" || rehechas.get(file)) continue;
      out[file] = "porcorregir";
    }
    return out;
  } catch (err) {
    console.error("[northdeco-estado] revisión no disponible:", err);
    return {};
  }
}
