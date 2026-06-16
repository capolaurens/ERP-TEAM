// Limitador de intentos de login en memoria (anti fuerza bruta).
// Clave por email. Suficiente para una instancia; para multi-instancia se
// migraría a Redis. Se reinicia al redesplegar.

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos

const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return true;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return true;
  }
  return entry.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

export function resetLogin(key: string): void {
  attempts.delete(key);
}
