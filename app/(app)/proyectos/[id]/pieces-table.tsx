"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  ExternalLink,
  Pencil,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  teamToggleMesh,
  teamToggleTexture,
  teamSetDriveUrl,
} from "../piece-actions";

export type PieceRow = {
  id: string;
  title: string;
  referenceUrl: string | null;
  driveUrl: string | null;
  mesh: boolean;
  texture: boolean;
};

function fire(action: (fd: FormData) => Promise<void>, fd: FormData) {
  return action(fd);
}

/** Pastilla de estado interno (entrega del equipo). */
function StatusPill({ mesh, texture }: { mesh: boolean; texture: boolean }) {
  const s =
    mesh && texture
      ? { cls: "border-green-200 bg-green-100 text-green-700", Icon: CheckCircle2, label: "Completo" }
      : !mesh && !texture
        ? { cls: "border-border bg-muted text-muted-foreground", Icon: Circle, label: "Sin empezar" }
        : {
            cls: "border-amber-200 bg-amber-100 text-amber-800",
            Icon: AlertTriangle,
            label: mesh ? "Falta textura" : "Falta malla",
          };
  const { cls, Icon, label } = s;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium",
        cls,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

function Checkbox({
  on,
  onClick,
  title,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={on}
        className={cn(
          "flex size-5 items-center justify-center rounded border transition active:scale-90",
          on
            ? "border-green-600 bg-green-600 text-white"
            : "border-muted-foreground/50 bg-white hover:border-green-600",
        )}
      >
        {on && <Check className="size-3.5" strokeWidth={3} />}
      </button>
    </div>
  );
}

/** Celda del link de Drive: ver / pegar / editar en línea. */
function DriveCell({
  taskId,
  initialUrl,
}: {
  taskId: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialUrl ?? "");
  const [, startTransition] = useTransition();

  function save() {
    const next = value.trim() || null;
    setUrl(next);
    setEditing(false);
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("url", value.trim());
    startTransition(() => {
      void fire(teamSetDriveUrl, fd);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(url ?? "");
              setEditing(false);
            }
          }}
          placeholder="Pega el link de Drive…"
          className="h-8 w-52 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={save}
          title="Guardar"
          className="flex size-7 items-center justify-center rounded-md border border-green-600 bg-green-600 text-white transition hover:opacity-90"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(url ?? "");
            setEditing(false);
          }}
          title="Cancelar"
          className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  if (url) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="size-3.5" /> Abrir
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Editar link"
          className="text-muted-foreground/60 transition hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      + Pegar link
    </button>
  );
}

/** Fila con estado local (malla/textura optimistas) para que el Estado reaccione. */
function PieceRowView({ piece }: { piece: PieceRow }) {
  const [mesh, setMesh] = useState(piece.mesh);
  const [texture, setTexture] = useState(piece.texture);
  const [, startTransition] = useTransition();

  function toggle(kind: "mesh" | "texture") {
    const fd = new FormData();
    fd.set("taskId", piece.id);
    if (kind === "mesh") {
      setMesh((v) => !v);
      startTransition(() => void fire(teamToggleMesh, fd));
    } else {
      setTexture((v) => !v);
      startTransition(() => void fire(teamToggleTexture, fd));
    }
  }

  return (
    <tr className="hover:bg-muted/30">
      <td className="border-b border-border px-3 py-2 font-medium">{piece.title}</td>
      <td className="border-b border-border px-3 py-2">
        {piece.referenceUrl ? (
          <a
            href={piece.referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" /> Ver
          </a>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </td>
      <td className="border-b border-border px-3 py-2">
        <DriveCell taskId={piece.id} initialUrl={piece.driveUrl} />
      </td>
      <td className="border-b border-border bg-green-50/40 px-3 py-2">
        <Checkbox
          on={mesh}
          onClick={() => toggle("mesh")}
          title={mesh ? "Quitar malla entregada" : "Marcar malla entregada"}
        />
      </td>
      <td className="border-b border-border bg-green-50/40 px-3 py-2">
        <Checkbox
          on={texture}
          onClick={() => toggle("texture")}
          title={texture ? "Quitar textura entregada" : "Marcar textura entregada"}
        />
      </td>
      <td className="border-b border-border px-3 py-2 text-center">
        <StatusPill mesh={mesh} texture={texture} />
      </td>
    </tr>
  );
}

export function PiecesTable({ pieces }: { pieces: PieceRow[] }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return ql
      ? pieces.filter((p) => p.title.toLowerCase().includes(ql))
      : pieces;
  }, [q, pieces]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {pieces.length} piezas · pon el link de Drive y marca malla/textura
          cuando estén hechas.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar SKU…"
            className="h-9 w-56 rounded-lg border border-border bg-white pl-8 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="border-b border-border px-3 py-2">Pieza</th>
              <th className="border-b border-border px-3 py-2">Link web</th>
              <th className="border-b border-border px-3 py-2">Link Drive</th>
              <th className="border-b border-border px-3 py-2 text-center">Malla</th>
              <th className="border-b border-border px-3 py-2 text-center">Textura</th>
              <th className="border-b border-border px-3 py-2 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <PieceRowView key={p.id} piece={p} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Ninguna pieza coincide con «{q}».
        </p>
      )}
    </div>
  );
}
