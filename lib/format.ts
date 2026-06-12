import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function formatDate(d: Date | null | undefined, fmt = "d MMM"): string {
  return d ? format(d, fmt, { locale: es }) : "";
}

export function formatDateTime(d: Date): string {
  return format(d, "d MMM yyyy, HH:mm", { locale: es });
}

export function formatRelative(d: Date): string {
  return formatDistanceToNow(d, { locale: es, addSuffix: true });
}

/** Para inputs <input type="date"> -> "YYYY-MM-DD". */
export function toDateInput(d: Date | null | undefined): string {
  return d ? format(d, "yyyy-MM-dd") : "";
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`;
}
