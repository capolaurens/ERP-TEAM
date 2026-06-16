import { Timer, Sparkles, Clock, CalendarDays, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { visibleTeams, ROLE_LABELS } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/time";
import type { Role } from "@/generated/prisma/enums";

const TZ = "Europe/Madrid"; // las horas se calculan en hora de España
const DAY_MS = 24 * 3600 * 1000;

export default async function TiempoPage() {
  const user = await requireAdmin();
  const teams = visibleTeams(user);

  // ---------- Asistencia: horas conectadas por día (últimos 7 días) ----------
  const dayKeyFmt = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }); // YYYY-MM-DD
  const dayLabelFmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
  });
  const now = Date.now();
  const todayKey = dayKeyFmt.format(new Date(now));
  const days: { key: string; label: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    days.push({ key: dayKeyFmt.format(d), label: dayLabelFmt.format(d) });
  }
  const weekStart = new Date(now - 7 * DAY_MS);

  const sessions = await prisma.workSession.findMany({
    where: { startedAt: { gte: weekStart } },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  type AttRow = {
    name: string;
    role: Role;
    perDay: Map<string, number>;
    total: number;
  };
  const att = new Map<string, AttRow>();
  for (const s of sessions) {
    if (!s.user) continue;
    const end = s.endedAt ?? s.lastSeenAt;
    const sec = Math.max(
      0,
      Math.floor((end.getTime() - s.startedAt.getTime()) / 1000),
    );
    if (sec <= 0) continue;
    const key = dayKeyFmt.format(s.startedAt);
    const row =
      att.get(s.user.id) ??
      ({ name: s.user.name, role: s.user.role, perDay: new Map(), total: 0 } as AttRow);
    row.perDay.set(key, (row.perDay.get(key) ?? 0) + sec);
    row.total += sec;
    att.set(s.user.id, row);
  }
  const attRows = [...att.values()].sort((a, b) => b.total - a.total);
  const todayTotalAll = attRows.reduce(
    (acc, r) => acc + (r.perDay.get(todayKey) ?? 0),
    0,
  );
  const weekTotalAll = attRows.reduce((acc, r) => acc + r.total, 0);

  // ---------- Tiempo por tarea + comparativa IA (registrado con cronómetro) ----------
  const entries = await prisma.timeEntry.findMany({
    where: { endedAt: { not: null }, task: { team: { in: teams } } },
    include: { task: { include: { project: true } }, user: true },
  });

  const weekAgo = now - 7 * DAY_MS;
  let total = 0;
  let weekTotal = 0;
  let aiSec = 0;
  let noAiSec = 0;
  const aiTasks = new Set<string>();
  const noAiTasks = new Set<string>();
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
  const tasksSorted = [...perTask.values()]
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tiempo</h1>
        <p className="text-muted-foreground">
          Horas de conexión del equipo (prácticas) y productividad. Solo
          administradores.
        </p>
      </div>

      {/* ---------- Asistencia ---------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <Clock className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {formatDuration(todayTotalAll)}
              </div>
              <div className="text-sm text-muted-foreground">
                Conectado hoy (equipo)
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">
                {formatDuration(weekTotalAll)}
              </div>
              <div className="text-sm text-muted-foreground">
                Conectado últimos 7 días
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" /> Horas de prácticas por día
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay registros de conexión. Las horas se cuentan
              automáticamente desde que cada persona abre el ERP hasta que lo
              cierra.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Persona</th>
                    {days.map((d) => (
                      <th
                        key={d.key}
                        className={
                          "px-2 py-2 text-center font-medium capitalize " +
                          (d.key === todayKey ? "text-primary" : "")
                        }
                      >
                        {d.label}
                        {d.key === todayKey ? " · hoy" : ""}
                      </th>
                    ))}
                    <th className="py-2 pl-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {attRows.map((r, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {ROLE_LABELS[r.role] ?? r.role}
                        </div>
                      </td>
                      {days.map((d) => {
                        const sec = r.perDay.get(d.key) ?? 0;
                        return (
                          <td
                            key={d.key}
                            className={
                              "px-2 py-2 text-center tabular-nums " +
                              (sec === 0
                                ? "text-muted-foreground/40"
                                : d.key === todayKey
                                  ? "font-medium text-primary"
                                  : "")
                            }
                          >
                            {sec === 0 ? "—" : formatDuration(sec)}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                        {formatDuration(r.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Productividad por tarea (cronómetro) ---------- */}
      {total > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total en tareas", value: formatDuration(total), icon: Timer, color: "bg-slate-100 text-slate-600" },
              { label: "Tareas: esta semana", value: formatDuration(weekTotal), icon: CalendarDays, color: "bg-blue-100 text-blue-600" },
              { label: "Con IA", value: formatDuration(aiSec), icon: Sparkles, color: "bg-primary/10 text-primary" },
              { label: "Sin IA", value: formatDuration(noAiSec), icon: Clock, color: "bg-slate-100 text-slate-600" },
            ].map((s) => {
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
        </>
      )}
    </div>
  );
}
