import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_BADGE,
  STATUS_LABELS,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
} from "@/lib/tasks";
import { cn } from "@/lib/utils";
import type { TaskCardData } from "./task-card";

export function TaskTable({ tasks }: { tasks: TaskCardData[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        No hay tareas que coincidan con el filtro.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Tarea</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Prioridad</th>
              <th className="px-4 py-3 font-medium">Proyecto</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Vence</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr
                key={t.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/tareas/${t.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {t.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_BADGE[t.status]}>
                    {STATUS_LABELS[t.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge className={PRIORITY_BADGE[t.priority]}>
                    {PRIORITY_LABELS[t.priority]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.projectName ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.assigneeName ?? "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-muted-foreground",
                    t.overdue && "font-medium text-red-600",
                  )}
                >
                  {t.dueDate ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
