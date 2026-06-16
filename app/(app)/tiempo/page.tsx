import { Timer, Sparkles, Clock, CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/session";
import { visibleTeams, isAdmin } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/time";

export default async function TiempoPage() {
  const user = await requireAuth();
  const teams = visibleTeams(user);

  const entries = await prisma.timeEntry.findMany({
    where: { endedAt: { not: null }, task: { team: { in: teams } } },
    include: { task: { include: { project: true } }, user: true },
  });

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 3600 * 1000;

  let total = 0;
  let weekTotal = 0;
  let aiSec = 0;
  let noAiSec = 0;
  const aiTasks = new Set<string>();
  const noAiTasks = new Set<string>();
  const perUser = new Map<string, { name: string; sec: number }>();
  const perTask = new Map<
    string,
    { title: string; project: string | null; sec: number; aiSec: number }
  >();

  for (const e of entries) {
    total += e.durationSec;
    if (e.endedAt && e.endedAt.getTime() >= weekAgo) weekTotal += e.durationSec;
    if (e.withAI) {
      aiSec += e.durationSec;
      if (e.taskId) aiTasks.add(e.taskId);
    } else {
      noAiSec += e.durationSec;
      if (e.taskId) noAiTasks.add(e.taskId);
    }
    const u = perUser.get(e.userId) ?? { name: e.user?.name ?? "Usuario", sec: 0 };
    u.sec += e.durationSec;
    perUser.set(e.userId, u);
    if (e.taskId) {
      const t = perTask.get(e.taskId) ?? {
        title: e.task?.title ?? "Tarea",
        project: e.task?.project?.name ?? null,
        sec: 0,
        aiSec: 0,
      };
      t.sec += e.durationSec;
      if (e.withAI) t.aiSec += e.durationSec;
      perTask.set(e.taskId, t);
    }
  }

  const avgAi = aiTasks.size ? aiSec / aiTasks.size : 0;
  const avgNoAi = noAiTasks.size ? noAiSec / noAiTasks.size : 0;
  const savingPct =
    avgAi > 0 && avgNoAi > 0
      ? Math.round(((avgNoAi - avgAi) / avgNoAi) * 100)
      : null;

  const usersSorted = [...perUser.values()].sort((a, b) => b.sec - a.sec);
  const tasksSorted = [...perTask.values()]
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 12);

  const stats = [
    { label: "Total registrado", value: formatDuration(total), icon: Timer, color: "bg-slate-100 text-slate-600" },
    { label: "Esta semana", value: formatDuration(weekTotal), icon: CalendarDays, color: "bg-blue-100 text-blue-600" },
    { label: "Con IA", value: formatDuration(aiSec), icon: Sparkles, color: "bg-primary/10 text-primary" },
    { label: "Sin IA", value: formatDuration(noAiSec), icon: Clock, color: "bg-slate-100 text-slate-600" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiempo</h1>
        <p className="text-muted-foreground">
          {isAdmin(user)
            ? "Horas del equipo y comparativa de productividad."
            : "Horas de tu equipo y comparativa de productividad."}
        </p>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Timer className="size-8" />
            <p>
              Aún no hay tiempo registrado. Usa el cronómetro «Empezar» en cada
              tarea (marcando «Con IA» cuando uses inteligencia artificial).
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle>Comparativa: con IA vs sin IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="size-4" /> Con IA
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {avgAi > 0 ? formatDuration(Math.round(avgAi)) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    media por pieza · {aiTasks.size} tarea(s)
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Clock className="size-4" /> Sin IA
                  </div>
                  <div className="mt-1 text-2xl font-semibold">
                    {avgNoAi > 0 ? formatDuration(Math.round(avgNoAi)) : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    media por pieza · {noAiTasks.size} tarea(s)
                  </div>
                </div>
              </div>
              {savingPct !== null && (
                <p className="text-sm">
                  {savingPct > 0 ? (
                    <>
                      Con IA se tarda un{" "}
                      <strong className="text-primary">{savingPct}% menos</strong>{" "}
                      por pieza de media. 🚀
                    </>
                  ) : savingPct < 0 ? (
                    <>
                      De momento, con IA se tarda un{" "}
                      <strong>{Math.abs(savingPct)}% más</strong> por pieza
                      (datos aún escasos).
                    </>
                  ) : (
                    <>Mismo tiempo medio con y sin IA por ahora.</>
                  )}
                </p>
              )}
              {(avgAi === 0 || avgNoAi === 0) && (
                <p className="text-xs text-muted-foreground">
                  Para comparar, registra tiempo en tareas con IA y sin IA.
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Horas por persona</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {usersSorted.map((u) => (
                    <li key={u.name} className="flex items-center justify-between py-2">
                      <span>{u.name}</span>
                      <span className="font-medium">{formatDuration(u.sec)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Horas por tarea</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {tasksSorted.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{t.title}</div>
                        {t.project && (
                          <div className="text-xs text-muted-foreground">{t.project}</div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.aiSec > 0 && (
                          <Badge className="bg-primary/10 text-primary">IA</Badge>
                        )}
                        <span className="font-medium">{formatDuration(t.sec)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
