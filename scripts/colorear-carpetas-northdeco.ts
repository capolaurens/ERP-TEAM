import "dotenv/config";
import {
  aplicarColores,
  estadoDeLasFamilias,
} from "../lib/northdeco-carpetas";

/**
 * Pone el color de la carpeta de Drive segun la revision del cliente.
 *
 * USO:  npx tsx scripts/colorear-carpetas-northdeco.ts            (solo mira)
 *       npx tsx scripts/colorear-carpetas-northdeco.ts --aplicar  (renombra)
 *       ... --todo    tambien pone 🟨 en las carpetas sin marca
 *
 * Renombra carpetas que el cliente tiene delante, asi que por defecto simula y
 * enseña lo que haria. Las marcas que no son nuestras (🟥, 🟦) se conservan.
 */
async function principal(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const todo = process.argv.includes("--todo");

  const familias = await estadoDeLasFamilias();
  const validadas = familias.filter((f) => f.estado === "validada");
  console.log(
    `${familias.length} familias publicadas, ${validadas.length} con TODAS sus piezas validadas por el cliente`,
  );

  const { cambios, sinCarpeta, aMano } = await aplicarColores({
    simular: !aplicar,
    soloVerde: !todo,
  });

  for (const f of cambios) {
    console.log(
      `${aplicar ? "renombro" : "renombraria"}  ${f.nombreActual}  ->  ${f.nombreNuevo}   (${f.validadas}/${f.piezas.length} validadas)`,
    );
  }
  if (!cambios.length) console.log("no hay ninguna carpeta que cambiar");
  for (const f of aMano) {
    console.log(
      `a mano     ${f.nombreActual}  (le toca ${f.nombreNuevo} pero lleva una marca que no es nuestra)`,
    );
  }
  if (sinCarpeta.length) {
    console.log(
      `\nsin carpeta en Drive (${sinCarpeta.length}): ${sinCarpeta.join(", ")}`,
    );
  }

  const pendientes = familias.filter(
    (f) => f.estado === "pendiente" && f.nombreActual?.includes("🟨"),
  );
  console.log(
    `\npara la hoja: ${pendientes.length} familias en 🟨 (FALTA VALIDAR) y ${validadas.length} en 🟩 (DONE)`,
  );
  process.exit(0);
}

principal();
