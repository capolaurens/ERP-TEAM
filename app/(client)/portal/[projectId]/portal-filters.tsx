"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const DEFAULT_FILTER = "con-modelo";

const FILTERS: { key: string; label: string }[] = [
  { key: "con-modelo", label: "Con modelo 3D" },
  { key: "por-validar", label: "Por validar" },
  { key: "validadas", label: "Validadas" },
  { key: "todas", label: "Todas" },
];

export function PortalFilters({
  counts,
  current,
  query,
}: {
  counts: Record<string, number>;
  current: string;
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(query);

  function go(next: URLSearchParams) {
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  function setFilter(key: string) {
    const p = new URLSearchParams(params.toString());
    if (key === DEFAULT_FILTER) p.delete("f");
    else p.set("f", key);
    go(p);
  }

  // Buscador con debounce; solo navega si cambió respecto a la URL.
  React.useEffect(() => {
    const currentQ = params.get("q") ?? "";
    if (q === currentQ) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (q.trim()) p.set("q", q.trim());
      else p.delete("q");
      go(p);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = current === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-primary/15" : "bg-muted",
                )}
              >
                {counts[f.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative ml-auto">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar SKU…"
          className="h-9 w-44 rounded-full border border-border bg-card pl-8 pr-3 text-sm shadow-sm outline-none transition focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/25"
        />
      </div>
    </div>
  );
}
