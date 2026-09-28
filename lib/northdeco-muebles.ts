import type { Pieza } from "./northdeco-catalogo";

/**
 * Muestrario sin marca (/muebles): una pieza por familia, sacada de la galería
 * ya validada, con un nombre genérico en vez del nombre comercial del producto.
 */

/** Palabras que describen el mueble y NO son nombre comercial. */
const DESCRIPTORES = new Set(
  [
    "Silla", "Sillón", "Sillon", "Butaca", "Mesa", "Mesita", "Taburete", "Sofá", "Sofa",
    "Banco", "Banqueta", "Puf", "Consola", "Aparador", "Estantería", "Estanteria",
    "Comedor", "Oficina", "Centro", "Auxiliar", "Escritorio", "Bar", "Noche", "Cocina",
    "Jardín", "Jardin", "Exterior", "Interior", "Lounge", "Relax",
    "Madera", "Metal", "Piel", "Polipiel", "Tela", "Tapizada", "Tapizado", "Ratán", "Ratan",
    "Rejilla", "Cristal", "Templado", "Acero", "Aluminio", "Polipropileno", "Plástico",
    "Plastico", "Microcemento", "Mármol", "Marmol", "Cerámica", "Ceramica", "Terciopelo",
    "Cuerda", "Trenzada", "Bouclé", "Boucle", "Lino", "Chapa", "Maciza", "Natural", "Nogal",
    "Roble", "Fresno", "Haya", "Arce", "Italiana", "Vintage",
    "Reposabrazos", "Regulable", "Giratoria", "Giratorio", "Plegable", "Apilable",
    "Extensible", "Redonda", "Redondo", "Ovalada", "Ovalado", "Rectangular", "Cuadrada",
    "Cuadrado", "Alta", "Alto", "Baja", "Bajo", "Nido", "Base", "Back",
    "Respaldo", "Brazos", "Ruedas", "Pata", "Patas", "Central", "Plazas", "Plaza",
    "Modular", "Chaise", "Longue", "Esquinero", "Nórdica", "Nordica", "Industrial",
    "Cantilever", "Voladiza", "Regulable", "Diseño", "Estilo",
  ].map((w) => w.toLowerCase()),
);

/**
 * "Silla de Oficina en Piel Low Base Baltimore" → "Silla de Oficina en Piel Low Base".
 * Quita, por el final, las palabras que parecen nombre comercial (con mayúscula
 * y fuera del vocabulario de descriptores), las medidas y lo que va entre
 * paréntesis. Si se queda sin nada, devuelve la primera palabra.
 */
export function nombreGenerico(titulo: string): string {
  const limpio = titulo.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const tokens = limpio.split(" ");
  while (tokens.length > 1) {
    const t = tokens[tokens.length - 1];
    const esDescriptor = DESCRIPTORES.has(t.toLowerCase().replace(/[,.]/g, ""));
    const esMedida = /\d/.test(t) || /^(cm|x|×|mm|m)$/i.test(t);
    const esNombre = /^[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ'-]*$/.test(t) && !esDescriptor;
    if (esMedida || esNombre || /^[-–·/]$/.test(t)) tokens.pop();
    else break;
  }
  // Un conector suelto al final ("Silla de") no aporta nada.
  while (tokens.length > 1 && /^(de|en|y|con|para|del)$/i.test(tokens[tokens.length - 1])) tokens.pop();
  const nombre = tokens.join(" ") || limpio.split(" ")[0];
  // Piezas sin título en la tienda: el nombre es el código de familia, y eso es marca.
  return /^ND-?\d{3,4}/i.test(nombre) ? "Mueble" : nombre;
}

/**
 * Una pieza por familia: primero las que el cliente ha dado por buenas, y a
 * igualdad la de menor orden en la galería. Se saltan las marcadas para rehacer.
 */
export function unaPorFamilia(
  piezas: Pieza[],
  listas: Record<string, "listo" | "porcorregir">,
  saltar: (file: string) => boolean,
): Pieza[] {
  const porFam = new Map<string, Pieza>();
  const peso = (p: Pieza) => (listas[p.file] === "listo" ? 0 : listas[p.file] === "porcorregir" ? 2 : 1);
  for (const p of piezas) {
    if (saltar(p.file)) continue;
    const actual = porFam.get(p.fam);
    if (!actual || peso(p) < peso(actual) || (peso(p) === peso(actual) && p.orden < actual.orden)) {
      porFam.set(p.fam, p);
    }
  }
  return [...porFam.values()].sort((a, b) => {
    const na = nombreGenerico(a.name), nb = nombreGenerico(b.name);
    return na.localeCompare(nb, "es") || a.fam.localeCompare(b.fam);
  });
}
