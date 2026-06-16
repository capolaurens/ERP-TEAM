/** Avatares de pixel-art (DiceBear) para la oficina virtual.
 *  Cada usuario puede elegir su personaje entre estas semillas;
 *  el elegido se guarda en User.avatarSeed y lo ven los demás. */

export const AVATAR_SEEDS = [
  "Aneka",
  "Bandit",
  "Boomer",
  "Callie",
  "Cleo",
  "Dusty",
  "Felix",
  "Gizmo",
  "Jasper",
  "Loki",
  "Maple",
  "Milo",
  "Nova",
  "Pepper",
  "Rocky",
  "Willow",
] as const;

export function dicebearUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(
    seed,
  )}&radius=10`;
}

/** Semilla efectiva: la elegida por el usuario, o su nombre/id como respaldo. */
export function effectiveSeed(
  avatarSeed: string | null | undefined,
  fallback: string,
): string {
  return avatarSeed && avatarSeed.length > 0 ? avatarSeed : fallback;
}
