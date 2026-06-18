/** Utilidades de fechas. Entrega siempre en JUEVES. */

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Próximos N jueves (incluido hoy si hoy es jueves). */
export function nextThursdays(
  count = 12,
  from: Date = new Date(),
): { value: string; label: string }[] {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (4 - d.getDay() + 7) % 7; // 4 = jueves
  d.setDate(d.getDate() + diff);
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      value: isoDay(d),
      label: `jue ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    });
    d.setDate(d.getDate() + 7);
  }
  return out;
}
