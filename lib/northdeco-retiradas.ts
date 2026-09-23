/**
 * Tarjetas que la galería /northdeco deja de enseñar aunque sigan publicadas
 * en la BD: mallas grises sin textura (sus variantes de color texturizadas
 * tienen tarjeta propia) y piezas cuyo GLB ya no está en Drive (el 3D da 404).
 * El panel no tiene forma de despublicar (su único endpoint que escribe solo
 * publica), y el cliente las estaba viendo.
 *
 * Por clave laxa del `file` (normalizarClave): "ND-0545 (1).glb" → "ND05451".
 * Se aplica al servir: la fila sigue en la BD con sus comentarios, y el alta
 * automática no la vuelve a publicar porque el catálogo ya la conoce.
 */
export const RETIRADAS: ReadonlySet<string> = new Set([
  // Sin textura
  "ND0606",
  "ND0661",
  "ND0773",
  "ND0780",
  "ND0933",
  "ND0950",
  // Aris: tres tarjetas con nombres de archivo que no son SKU y el mismo
  // modelo repetido; las sustituyen ND-0893-CLEAR-WALNUT y -GOLDENTEA-WALNUT
  "ND0893ARISMESA36",
  "ND0893ARISMESA43",
  "ND0893ARISMESA46",
  // GLB desaparecido de Drive
  "ND05451",
  "ND0732ND0732NATURAL",
  "ND0786",
  "ND0883",
  "ND0962",
  // Fuera de la lista de revisión de esta semana (2026-09-22): la hoja las
  // lista, pero el cliente solo va a mirar las 159 primeras filas
  "ND0831LEABLACK1P", // ND-0831-LEA-BLACK-1P.glb
  "ND0715TRANSPARENT", // ND-0715-TRANSPARENT.glb
  // Fuera de la lista de 128 piezas revisadas a mano una a una (Lorenzo, 2026-09-23):
  // la galería enseña solo esas; las demás siguen publicadas con sus comentarios
  "ND0052PUBLACK3P", // ND-0052-PU-BLACK-3P.glb
  "ND0112TY113", // ND-0112-TY-113.glb
  "ND0586", // ND-0586.glb
  "ND0603MAPLEBLACK", // ND-0603-MAPLE-BLACK.glb
  "ND0603MAPLEWHITE", // ND-0603-MAPLE-WHITE.glb
  "ND0603WALNUTBLACK", // ND-0603-WALNUT-BLACK.glb
  "ND0625BLACKASH", // ND-0625-BLACK-ASH.glb
  "ND0625BLACKWALNUT", // ND-0625-BLACK-WALNUT.glb
  "ND06411BLACK", // ND-0641-1-BLACK.glb
  "ND0646BLACK", // ND-0646-BLACK.glb
  "ND0646DARKWALNUT", // ND-0646-DARKWALNUT.glb
  "ND0646NATURAL", // ND-0646-NATURAL.glb
  "ND0646WALNUT", // ND-0646-WALNUT.glb
  "ND0732NATURAL", // ND-0732-NATURAL.glb
  "ND0751", // ND-0751.glb
  "ND0774WALNUT", // ND-0774-WALNUT.glb
  "ND0776WALNUT", // ND-0776-WALNUT.glb
  "ND0778NATURAL", // ND-0778-NATURAL.glb
  "ND0780NATURAL", // ND-0780-NATURAL.glb
  "ND0780WALNUT", // ND-0780-WALNUT.glb
  "ND0787SANDBROWN", // ND-0787-SANDBROWN.glb
  "ND0791BEIGE", // ND-0791-BEIGE.glb
  "ND0817VINTAGE", // ND-0817-VINTAGE.glb
  "ND0818VINTAGE", // ND-0818-VINTAGE.glb
  "ND0820POLISHED", // ND-0820-POLISHED.glb
  "ND0823BEIGE", // ND-0823-BEIGE.glb
  "ND0823BLACK", // ND-0823-BLACK.glb
  "ND0823POLISHED", // ND-0823-POLISHED.glb
  "ND0828BLACK", // ND-0828-BLACK.glb
  "ND0829BLACK", // ND-0829-BLACK.glb
  "ND0844WALNUT", // ND-0844-WALNUT.glb
  "ND0855WALNUT", // ND-0855-WALNUT.glb
  "ND0871NATURAL", // ND-0871-NATURAL.glb
  "ND0917BLACK", // ND-0917-BLACK.glb
  "ND0917NATURAL", // ND-0917-NATURAL.glb
  "ND0917WALNUT", // ND-0917-WALNUT.glb
  "ND0923BEIGE", // ND-0923-BEIGE.glb
  "ND0923GREEN", // ND-0923-GREEN.glb
  "ND0935", // ND-0935.glb
]);

/**
 * Tarjetas viejas que se retiran SOLO cuando ya se ve la que las sustituye,
 * para que el modelo no desaparezca de la galería entre medias.
 */
export const SUSTITUIDAS: Readonly<Record<string, string>> = {
  ND0733: "ND0733WHITE",
};
