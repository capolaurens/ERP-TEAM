"use client";

import { useState } from "react";
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
import { moveTask } from "./actions";
import { TaskCard, type TaskCardData } from "./task-card";
import { STATUS_ORDER, STATUS_LABELS, STATUS_DOT } from "@/lib/tasks";
import type { TaskStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export function TaskBoard({ tasks }: { tasks: TaskCardData[] }) {
  const [items, setItems] = useState<TaskCardData[]>(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const byStatus = (s: TaskStatus) => items.filter((t) => t.status === s);

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);
    const target = STATUS_ORDER.includes(overId as TaskStatus)
      ? (overId as TaskStatus)
      : null;
    if (!target) return;
    const task = items.find((t) => t.id === taskId);
    if (!task || task.status === target) return;
    const order = byStatus(target).length;
    setItems((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: target } : t)),
    );
    moveTask(taskId, target, order);
  }

  const active = activeId ? items.find((t) => t.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <Column key={status} status={status} tasks={byStatus(status)} />
        ))}
      </div>
      <DragOverlay>{active ? <TaskCard task={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ status, tasks }: { status: TaskStatus; tasks: TaskCardData[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border border-border bg-muted/40 p-3 transition",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
          {STATUS_LABELS[status]}
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Arrastra tareas aquí
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ task }: { task: TaskCardData }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <TaskCard task={task} />
    </div>
  );
}
