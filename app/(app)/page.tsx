import Link from "next/link";
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams, isAdmin } from "@/lib/rbac";
import { PRIORITY_BADGE, PRIORITY_LABELS } from "@/lib/tasks";
import { formatDate, formatRelative } from "@/lib/format";
import { activityLabel } from "@/lib/activity-format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/generated/prisma/enums";

export default async function DashboardPage() {
  const user = await requireAuth();
  const teams = visibleTeams(user);
  const now = new Date();

  const [grouped, overdue, myTasks, activities] = await Promise.all([
    prisma.task.groupBy({
      by: ["status"],
      where: { team: { in: teams } },
      _count: { _all: true },
    }),
    prisma.task.count({
      where: { team: { in: teams }, status: { not: "DONE" }, dueDate: { lt: now } },
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: { project: true },
    }),
    prisma.activity.findMany({
      where: {
        OR: [
          { task: { team: { in: teams } } },
          { project: { team: { in: teams } } },
        ],
      },
      include: { actor: true, task: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const countOf = (s: TaskStatus) =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;

  const stats = [
    { label: "Pendientes", value: countOf("TODO"), icon: CheckSquare, color: "bg-slate-100 text-slate-600" },
    { label: "En progreso", value: countOf("IN_PROGRESS"), icon: Clock, color: "bg-blue-100 text-blue-600" },
    { label: "Completadas", value: countOf("DONE"), icon: CheckCircle2, color: "bg-green-100 text-green-600" },
    { label: "Vencidas", value: overdue, icon: AlertTriangle, color: "bg-red-100 text-red-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {user.name} 👋</h1>
        <p className="text-muted-foreground">
          {isAdmin(user)
            ? "Resumen global del equipo."
            : "Resumen de tu área de trabajo."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-4">
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${s.color}`}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold">{s.value}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Mis tareas</CardTitle>
            <Link
              href="/tareas"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tienes tareas pendientes asignadas. ¡Buen trabajo! 🎉
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {myTasks.map((t) => {
                  const isOverdue =
                    !!t.dueDate && t.dueDate.getTime() < now.getTime();
                  return (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <Link
                          href={`/tareas/${t.id}`}
                          className="block truncate text-sm font-medium hover:text-primary"
                        >
                          {t.title}
                        </Link>
                        {t.project && (
                          <span className="text-xs text-muted-foreground">
                            {t.project.name}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.dueDate && (
                          <span
                            className={
                              isOverdue
                                ? "text-xs font-medium text-red-600"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            {formatDate(t.dueDate)}
                          </span>
                        )}
                        <Badge className={PRIORITY_BADGE[t.priority]}>
                          {PRIORITY_LABELS[t.priority]}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aquí aparecerá la actividad del equipo.
              </p>
            ) : (
              <ul className="space-y-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
                    <div className="min-w-0">
                      <span className="font-medium">
                        {a.actor?.name ?? "Alguien"}
                      </span>{" "}
                      {activityLabel(a.type, a.meta)}
                      {a.task && (
                        <>
                          {" · "}
                          <Link
                            href={`/tareas/${a.task.id}`}
                            className="text-primary hover:underline"
                          >
                            {a.task.title}
                          </Link>
                        </>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {formatRelative(a.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
