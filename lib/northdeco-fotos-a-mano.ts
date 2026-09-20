/**
 * Fotos de referencia puestas a mano en la galería /northdeco, por clave laxa
 * (normalizarClave del SKU o del file): "ND-0791-BEIGE" → "ND0791BEIGE".
 *
 * Para las fichas donde la tienda tiene la foto destacada de otra variante o
 * de otro producto. Un valor string es la URL de la foto buena (CDN de
 * Shopify); null quita la foto (mejor ninguna que una que no es).
 */
export const FOTOS_A_MANO: Record<string, string | null> = {
  // Maestro verde aguacate: la tienda ya no vende esa variante (sin foto
  // destacada), pero conserva sus fotos en el producto. Esta es la frontal.
  ND0299AVOCADOGREEN:
    "https://cdn.shopify.com/s/files/1/0520/3286/4435/files/SillaMaestroND-0299Green_02_98995138-64c4-4e1e-8336-99ac53637cc6.jpg",
  // Juno Brown: el GLB se llama ND-0936 a secas y la tienda tiene dos
  // productos Juno (el marrón y el blanco en tres tamaños), así que el cruce
  // automático no elige. El modelo es el marrón.
  ND0936:
    "https://cdn.shopify.com/s/files/1/0520/3286/4435/files/Mesa-ND-0936-Brown-Northdeco-Frontal.jpg",
};
