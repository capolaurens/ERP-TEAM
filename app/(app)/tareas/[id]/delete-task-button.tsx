"use client";

import { Trash2 } from "lucide-react";
import { deleteTask } from "../actions";

export function DeleteTaskButton({
  taskId,
  title,
}: {
  taskId: string;
  title: string;
}) {
  return (
    <form
      action={deleteTask}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar la tarea «${title}»? Esta acción no se puede deshacer.`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={taskId} />
      <button className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
        <Trash2 className="size-4" />
        Eliminar
      </button>
    </form>
  );
}
