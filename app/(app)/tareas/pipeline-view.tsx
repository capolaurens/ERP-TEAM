"use client";

import { useMemo, useState } from "react";
import { PipelineBoard, type PipelinePiece } from "./pipeline-board";

export function PipelineView({
  pieces,
  projects,
}: {
  pieces: PipelinePiece[];
  projects: { id: string; name: string }[];
}) {
  const [pid, setPid] = useState<string>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return pieces.filter(
      (p) =>
        (pid === "all" || p.projectId === pid) &&
        (!ql || p.title.toLowerCase().includes(ql)),
    );
  }, [pieces, pid, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {projects.length > 1 && (
          <select
            value={pid}
            onChange={(e) => setPid(e.target.value)}
            className="h-9 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary"
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar SKU…"
          className="h-9 w-52 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary"
        />
        <p className="ml-auto text-xs text-muted-foreground">
          Arrastra una pieza a la derecha cuando termines esa fase.
        </p>
      </div>
      <PipelineBoard key={`${pid}·${q}`} pieces={shown} />
    </div>
  );
}
