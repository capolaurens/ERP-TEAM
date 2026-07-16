"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  COLUMNS,
  type Column,
  type PipelineFlags,
  pieceStage,
  stageColumn,
  stageBadge,
  isDraggable,
  dropAction,
} from "@/lib/pipeline";
import { teamToggleMesh, teamToggleTexture } from "../proyectos/piece-actions";

export type PipelinePiece = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
} & PipelineFlags;

function fire(action: (fd: FormData) => Promise<void>, taskId: string) {
  const fd = new FormData();
  fd.set("taskId", taskId);
  return action(fd);
}

const DOT: Record<Column, string> = {
  SIN_EMPEZAR: "bg-muted-foreground/40",
  MALLA: "bg-amber-500",
  PARA_TEXTURA: "bg-blue-500",
  TEXTURA: "bg-green-500",
};

export function PipelineBoard({ pieces }: { pieces: PipelinePiece[] }) {
  const router = useRouter();
  const [items, setItems] = useState(pieces);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Distingue "click" (abrir detalle) de "arrastrar" (mover fase): onDragStart
  // solo salta si de verdad se arrastró (≥5px), así el click limpio abre la ficha.
  const justDragged = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const [collapsed, setCollapsed] = useState<Set<Column>>(new Set());
  function toggleCollapse(c: Column) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  const colItems = (c: Column) =>
    items.filter((p) => stageColumn(pieceStage(p)) === c);

  function openTask(id: string) {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    router.push(`/tareas/${id}`);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    window.setTimeout(() => {
      justDragged.current = false;
    }, 120);
    const { active, over } = e;
    if (!over) return;
    const id = String(active.id);
    const target = String(over.id) as Column;
    const p = items.find((x) => x.id === id);
    if (!p) return;
    const action = dropAction(pieceStage(p), target);
    if (!action) return;
    setItems((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        if (action === "submitMesh") return { ...x, meshSubmitted: true };
        if (action === "unsubmitMesh") return { ...x, meshSubmitted: false };
        if (action === "submitTexture") return { ...x, textureSubmitted: true };
        return { ...x, textureSubmitted: false };
      }),
    );
    const serverAction = action.includes("Mesh") ? teamToggleMesh : teamToggleTexture;
    void fire(serverAction, id);
  }

  const active = activeId ? items.find((x) => x.id === activeId) : null;

  return (
    <DndContext
      id="pipeline-board"
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => {
        justDragged.current = true;
        setActiveId(String(e.active.id));
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-4">
        {COLUMNS.map((col) => (
          <Col
            key={col.id}
            col={col.id}
            label={col.label}
            pieces={colItems(col.id)}
            onOpen={openTask}
            collapsed={collapsed.has(col.id)}
            onToggle={() => toggleCollapse(col.id)}
          />
        ))}
      </div>
      <DragOverlay>{active ? <Card piece={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Col({
  col,
  label,
  pieces,
  onOpen,
  collapsed,
  onToggle,
}: {
  col: Column;
  label: string;
  pieces: PipelinePiece[];
  onOpen: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col });
  const empty =
    col === "SIN_EMPEZAR"
      ? "Nada pendiente"
      : col === "MALLA"
        ? "Arrastra aquí al terminar la malla"
        : col === "PARA_TEXTURA"
          ? "Vuelven cuando el cliente aprueba la malla"
          : "Arrastra aquí al terminar la textura";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-muted/40 p-3 transition",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "Desplegar" : "Plegar"}
        className="mb-3 flex w-full items-center justify-between gap-2 px-1"
      >
        <div className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide">
          {collapsed ? (
            <ChevronRight className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
          <span className={cn("size-2 rounded-full", DOT[col])} />
          {label}
        </div>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {pieces.length}
        </span>
      </button>
      {!collapsed && (
        <div className="flex max-h-[calc(100vh-16rem)] min-h-24 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {pieces.map((p) =>
            isDraggable(pieceStage(p)) ? (
              <DraggableCard key={p.id} piece={p} onOpen={onOpen} />
            ) : (
              <Card key={p.id} piece={p} onOpen={() => onOpen(p.id)} />
            ),
          )}
          {pieces.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              {empty}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableCard({
  piece,
  onOpen,
}: {
  piece: PipelinePiece;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: piece.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab touch-none active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <Card piece={piece} onOpen={() => onOpen(piece.id)} />
    </div>
  );
}

function Card({
  piece,
  overlay,
  onOpen,
}: {
  piece: PipelinePiece;
  overlay?: boolean;
  onOpen?: () => void;
}) {
  const stage = pieceStage(piece);
  const badge = stageBadge(stage);
  const locked = !isDraggable(stage);
  const hint =
    stage === "SIN_EMPEZAR"
      ? "Haz la malla"
      : stage === "PARA_TEXTURA"
        ? "Añade la textura"
        : null;
  return (
    <div
      onClick={onOpen}
      title={onOpen ? "Ver ficha de la pieza" : undefined}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm transition",
        onOpen && "hover:border-primary/60 hover:shadow-md",
        onOpen && locked && "cursor-pointer",
        overlay && "shadow-float",
        locked ? "border-border/60 opacity-70" : "border-border",
      )}
    >
      <div className="text-sm font-medium">{piece.title}</div>
      {piece.projectName && (
        <div className="mt-0.5 text-xs text-muted-foreground">{piece.projectName}</div>
      )}
      {badge && (
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            badge.tone === "amber" && "bg-amber-100 text-amber-800",
            badge.tone === "blue" && "bg-blue-100 text-blue-700",
            badge.tone === "green" && "bg-green-100 text-green-700",
            badge.tone === "grey" && "bg-muted text-muted-foreground",
          )}
        >
          {badge.label}
        </span>
      )}
      {hint && (
        <span className="mt-2 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {hint}
        </span>
      )}
    </div>
  );
}
