"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabecera de columna ordenable. Clic: asc → desc → sin orden.
 * Guarda el orden en la URL (`?sort=<col>&dir=<asc|desc>`) conservando el resto
 * de parámetros (filtro/búsqueda).
 */
export function SortHeader({
  col,
  label,
  align = "left",
  thClassName,
}: {
  col: string;
  label: React.ReactNode;
  align?: "left" | "center";
  thClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const curSort = params.get("sort");
  const curDir = params.get("dir") === "desc" ? "desc" : "asc";
  const active = curSort === col;

  function onClick() {
    const p = new URLSearchParams(params.toString());
    if (!active) {
      p.set("sort", col);
      p.set("dir", "asc");
    } else if (curDir === "asc") {
      p.set("sort", col);
      p.set("dir", "desc");
    } else {
      p.delete("sort");
      p.delete("dir");
    }
    const s = p.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  return (
    <th className={cn("border-b border-border px-3 py-2", thClassName)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-foreground",
          align === "center" && "justify-center",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        title="Ordenar por esta columna"
      >
        {label}
        {active ? (
          curDir === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown className="size-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}
