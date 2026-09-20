/**
 * Mesas de cristal ocultas de la galería mientras se rehacen.
 *
 * El cristal es lo único del catálogo que no sale bien de la primera: en el
 * visor de la web las superficies transmisivas no entran en el buffer de
 * transmisión de three.js, así que una mesa en U se ve como un bloque macizo y
 * una luna no deja ver la de detrás. Hay que rehacerlas con el tinte en el
 * alfa (BLEND, ior 1,52 y el canto más opaco), y hasta entonces el cliente no
 * las ve: 29 tarjetas, todas "Mesa ... de Cristal Templado".
 *
 * Se quitan al servir, como las retiradas: la fila sigue en la BD con sus
 * comentarios y vuelven con solo borrar su línea de aquí.
 *
 * Por clave laxa del `file` (normalizarClave): "ND-0112-TY-113.glb" → "ND0112TY113".
 */
export const OCULTAS: ReadonlySet<string> = new Set([
  // Helen
  "ND0112TY113", // ND-0112-TY-113.glb
  // Corina
  "ND0586", // ND-0586.glb
  // Cheval
  "ND0700GOLDENTEA", // ND-0700-GOLDENTEA.glb
  "ND0700SMOKE", // ND-0700-SMOKE.glb
  "ND0700TEA", // ND-0700-TEA.glb
  "ND0700", // ND-0700.glb
  // Ottish
  "ND0701", // ND-0701.glb
  // Ona
  "ND0703GOLDENTEA", // ND-0703-GOLDENTEA.glb
  "ND0703SMOKE", // ND-0703-SMOKE.glb
  "ND0703", // ND-0703.glb
  // Burano
  "ND0727CLEAR", // ND-0727-CLEAR.glb
  "ND0727GOLDENTEA", // ND-0727-GOLDENTEA.glb
  "ND0727SMOKE", // ND-0727-SMOKE.glb
  "ND0727TEA", // ND-0727-TEA.glb
  // Jolene
  "ND0728CLEAR", // ND-0728-CLEAR.glb
  // Saura
  "ND0794CLEAR", // ND-0794-CLEAR.glb
  "ND0794GOLDENTEA", // ND-0794-GOLDENTEA.glb
  "ND0794GREEN", // ND-0794-GREEN.glb
  "ND0794SMOKE", // ND-0794-SMOKE.glb
  "ND0794TEA", // ND-0794-TEA.glb
  // Tossa
  "ND0795CLEAR", // ND-0795-CLEAR.glb
  "ND0795SMOKE", // ND-0795-SMOKE.glb
  "ND0795TEA", // ND-0795-TEA.glb
  // Michi
  "ND0844WALNUT", // ND-0844-WALNUT.glb
  // Olivier
  "ND0891CLEAR", // ND-0891-CLEAR.glb
  "ND0891GOLDENTEA", // ND-0891-GOLDENTEA.glb
  // Aris
  "ND0893CLEARWALNUT", // ND-0893-CLEAR-WALNUT.glb
  "ND0893GOLDENTEAWALNUT", // ND-0893-GOLDENTEA-WALNUT.glb
  // Cos
  "ND0927CLEAR", // ND-0927-CLEAR.glb
]);
