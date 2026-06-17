import Link from "next/link";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  PHASE_BADGE,
  PHASE_LABELS,
} from "@/lib/tasks";
import type { Priority, TaskStatus, Team, ModelPhase } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

export type TaskCardData = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  team: Team;
  phase: ModelPhase;
  clientApproved: boolean;
  dueDate: string | null;
  overdue: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
};

export function TaskCard({
  task,
  overlay,
}: {
  task: TaskCardData;
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 shadow-sm",
        overlay && "shadow-lg",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Badge className={PRIORITY_BADGE[task.priority]}>
            {PRIORITY_LABELS[task.priority]}
          </Badge>
          {task.team === "DESIGN" && (
            <Badge className={PHASE_BADGE[task.phase]}>
              {PHASE_LABELS[task.phase]}
            </Badge>
          )}
        </div>
        {task.assigneeName && (
          <span
            className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
            title={task.assigneeName}
          >
            {task.assigneeName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <Link
        href={`/tareas/${task.id}`}
        className="block text-sm font-medium leading-snug hover:text-primary"
      >
        {task.title}
      </Link>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        {task.projectName && <span className="truncate">{task.projectName}</span>}
        {task.dueDate && (
          <span
            className={cn(
              "ml-auto flex items-center gap-1",
              task.overdue && "font-medium text-red-600",
            )}
          >
            <Calendar className="size-3" />
            {task.dueDate}
          </span>
        )}
      </div>
    </div>
  );
}
