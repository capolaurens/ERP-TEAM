/* Logger mínimo para el compresor (portado de navyx-saas). */
export const logger = {
  info: (...a: unknown[]) => console.log("[compresor]", ...a),
  warn: (...a: unknown[]) => console.warn("[compresor]", ...a),
  error: (...a: unknown[]) => console.error("[compresor]", ...a),
};
