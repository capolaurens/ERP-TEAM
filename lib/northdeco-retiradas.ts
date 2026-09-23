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
]);

/**
 * Tarjetas viejas que se retiran SOLO cuando ya se ve la que las sustituye,
 * para que el modelo no desaparezca de la galería entre medias.
 */
export const SUSTITUIDAS: Readonly<Record<string, string>> = {
  ND0733: "ND0733WHITE",
};
