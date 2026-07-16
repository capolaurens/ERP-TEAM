/**
 * Pipeline por fases de una pieza 3D. El estado se DERIVA de 6 señales en orden:
 * el chico ENVÍA malla → el admin la aprueba → el cliente le da el OK →
 * el chico ENVÍA textura → el admin la aprueba → el cliente le da el OK.
 */

export type Stage =
  | "SIN_EMPEZAR" // el chico hace la malla
  | "MALLA_REV_ADMIN" // enviada, espera aprobación del admin
  | "MALLA_REV_CLIENTE" // aprobada por admin, espera OK del cliente
  | "PARA_TEXTURA" // cliente dio OK a la malla → el chico hace la textura
  | "TEX_REV_ADMIN" // textura enviada, espera admin
  | "TEX_REV_CLIENTE" // aprobada por admin, espera OK del cliente
  | "COMPLETO"; // cliente dio OK a la textura

export type PipelineFlags = {
  meshSubmitted: boolean;
  meshApproved: boolean;
  clientMesh: boolean;
  textureSubmitted: boolean;
  textureApproved: boolean;
  clientTexture: boolean;
};

export function pieceStage(f: PipelineFlags): Stage {
  if (!f.meshSubmitted) return "SIN_EMPEZAR";
  if (!f.meshApproved) return "MALLA_REV_ADMIN";
  if (!f.clientMesh) return "MALLA_REV_CLIENTE";
  if (!f.textureSubmitted) return "PARA_TEXTURA";
  if (!f.textureApproved) return "TEX_REV_ADMIN";
  if (!f.clientTexture) return "TEX_REV_CLIENTE";
  return "COMPLETO";
}

/** Las 4 columnas del tablero del chico de diseño. */
export type Column = "SIN_EMPEZAR" | "MALLA" | "PARA_TEXTURA" | "TEXTURA";

export const COLUMNS: { id: Column; label: string }[] = [
  { id: "SIN_EMPEZAR", label: "Sin empezar" },
  { id: "MALLA", label: "Malla terminada" },
  { id: "PARA_TEXTURA", label: "Para textura" },
  { id: "TEXTURA", label: "Textura añadida" },
];

export function stageColumn(s: Stage): Column {
  switch (s) {
    case "SIN_EMPEZAR":
      return "SIN_EMPEZAR";
    case "MALLA_REV_ADMIN":
    case "MALLA_REV_CLIENTE":
      return "MALLA";
    case "PARA_TEXTURA":
      return "PARA_TEXTURA";
    default:
      return "TEXTURA"; // TEX_REV_ADMIN | TEX_REV_CLIENTE | COMPLETO
  }
}

/** Etiqueta corta del estado dentro de la columna (para tarjetas bloqueadas). */
export function stageBadge(s: Stage): { label: string; tone: "grey" | "amber" | "blue" | "green" } | null {
  switch (s) {
    case "MALLA_REV_ADMIN":
    case "TEX_REV_ADMIN":
      return { label: "En revisión (admin)", tone: "amber" };
    case "MALLA_REV_CLIENTE":
    case "TEX_REV_CLIENTE":
      return { label: "En revisión (cliente)", tone: "blue" };
    case "COMPLETO":
      return { label: "Completo", tone: "green" };
    default:
      return null; // SIN_EMPEZAR / PARA_TEXTURA: el chico trabaja, sin badge
  }
}

/** ¿El chico puede arrastrar esta tarjeta? Solo cuando le toca a él o para
 *  retirar un envío que el admin aún no ha aprobado. */
export function isDraggable(s: Stage): boolean {
  return (
    s === "SIN_EMPEZAR" ||
    s === "PARA_TEXTURA" ||
    s === "MALLA_REV_ADMIN" ||
    s === "TEX_REV_ADMIN"
  );
}

/**
 * Dada la fase actual de una tarjeta y la columna destino, devuelve la acción a
 * ejecutar (o null si el movimiento no es válido).
 */
export function dropAction(
  s: Stage,
  target: Column,
): "submitMesh" | "unsubmitMesh" | "submitTexture" | "unsubmitTexture" | null {
  if (s === "SIN_EMPEZAR" && target === "MALLA") return "submitMesh";
  if (s === "MALLA_REV_ADMIN" && target === "SIN_EMPEZAR") return "unsubmitMesh";
  if (s === "PARA_TEXTURA" && target === "TEXTURA") return "submitTexture";
  if (s === "TEX_REV_ADMIN" && target === "PARA_TEXTURA") return "unsubmitTexture";
  return null;
}
