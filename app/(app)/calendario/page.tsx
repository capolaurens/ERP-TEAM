import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams } from "@/lib/rbac";
import { CalendarView } from "./calendar-view";

export default async function CalendarioPage() {
  const user = await requireAuth();
  const teams = visibleTeams(user);

  const tasksRaw = await prisma.task.findMany({
    where: { team: { in: teams }, dueDate: { not: null }, status: { not: "DONE" } },
    select: { id: true, title: true, dueDate: true, status: true, priority: true },
  });

  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    dayKey: format(t.dueDate!, "yyyy-MM-dd"),
    status: t.status,
    priority: t.priority,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Calendario</h1>
        <p className="text-muted-foreground">
          Vencimientos de las tareas de tu equipo por fecha.
        </p>
      </div>
      <CalendarView tasks={tasks} />
    </div>
  );
}
