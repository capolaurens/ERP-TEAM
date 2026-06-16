"use client";

import { useEffect, useState } from "react";
import { Play, Square, Plus, Trash2, Sparkles } from "lucide-react";
import {
  startTimer,
  stopTimer,
  addManualEntry,
  deleteTimeEntry,
} from "@/app/(app)/time-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatClock, formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

type Entry = {
  id: string;
  userName: string;
  durationSec: number;
  withAI: boolean;
  note: string | null;
  when: string;
  canDelete: boolean;
};

export function TimeTracker({
  taskId,
  running,
  entries,
  totalSec,
  aiSec,
  noAiSec,
}: {
  taskId: string;
  running: { taskId: string; startedAt: string } | null;
  entries: Entry[];
  totalSec: number;
  aiSec: number;
  noAiSec: number;
}) {
  const runningHere = running?.taskId === taskId;
  const runningElsewhere = !!running && running.taskId !== taskId;
  const [withAI, setWithAI] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!runningHere || !running) return;
    const start = new Date(running.startedAt).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [runningHere, running?.startedAt, running]);

  return (
    <div className="space-y-4">
      {runningHere ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-2xl font-semibold tabular-nums">
              {formatClock(elapsed)}
            </div>
            <form action={stopTimer}>
              <Button type="submit" variant="destructive" size="sm">
                <Square className="size-4" /> Parar
              </Button>
            </form>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Cronómetro en marcha…
          </div>
        </div>
      ) : runningElsewhere ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Tienes un cronómetro activo en otra tarea.
          <form action={stopTimer} className="mt-2">
            <Button type="submit" variant="outline" size="sm">
              <Square className="size-4" /> Parar el otro
            </Button>
          </form>
        </div>
      ) : (
        <form action={startTimer} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="withAI" value={withAI ? "true" : "false"} />
          <Button type="submit">
            <Play className="size-4" /> Empezar
          </Button>
          <label
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition",
              withAI
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={withAI}
              onChange={(e) => setWithAI(e.target.checked)}
            />
            <Sparkles className="size-4" /> Con IA
          </label>
        </form>
      )}

      <form action={addManualEntry} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="taskId" value={taskId} />
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Minutos</span>
          <Input
            name="minutes"
            type="number"
            min={1}
            placeholder="45"
            className="h-9 w-20"
            required
          />
        </div>
        <div className="min-w-32 flex-1 space-y-1">
          <span className="text-xs text-muted-foreground">Nota (opcional)</span>
          <Input name="note" placeholder="¿Qué hiciste?" className="h-9" />
        </div>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground">
          <input type="checkbox" name="withAI" value="true" />
          <Sparkles className="size-3.5" /> IA
        </label>
        <Button type="submit" variant="outline" size="sm">
          <Plus className="size-4" /> Añadir
        </Button>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-slate-100 text-slate-700">
          Total: {formatDuration(totalSec)}
        </Badge>
        <Badge className="bg-primary/10 text-primary">
          Con IA: {formatDuration(aiSec)}
        </Badge>
        <Badge className="bg-slate-100 text-slate-600">
          Sin IA: {formatDuration(noAiSec)}
        </Badge>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay tiempo registrado.
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {formatDuration(e.durationSec)}
                  </span>
                  {e.withAI && (
                    <Badge className="bg-primary/10 text-primary">IA</Badge>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {e.userName} · {e.when}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </div>
              {e.canDelete && (
                <form action={deleteTimeEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button
                    className="text-muted-foreground transition hover:text-red-600"
                    title="Eliminar registro"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
