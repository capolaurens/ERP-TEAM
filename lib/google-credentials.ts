type ServiceAccount = {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
};

/**
 * Parsea las credenciales de una cuenta de servicio de Google desde una
 * variable de entorno. Acepta el JSON tal cual o codificado en base64
 * (útil para Railway, donde no hay sistema de archivos persistente).
 * Patrón reutilizado del servicio Vertex AI de navyx-saas.
 */
export function parseServiceAccount(
  raw: string | undefined,
): ServiceAccount | null {
  if (!raw || !raw.trim()) return null;

  const tryParse = (s: string): ServiceAccount | null => {
    try {
      return JSON.parse(s) as ServiceAccount;
    } catch {
      return null;
    }
  };

  let parsed = tryParse(raw);
  if (!parsed) {
    try {
      parsed = tryParse(Buffer.from(raw, "base64").toString("utf-8"));
    } catch {
      parsed = null;
    }
  }

  if (!parsed || !parsed.client_email || !parsed.private_key) return null;
  // Las claves privadas a veces llegan con \n escapados.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}
