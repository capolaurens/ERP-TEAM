import { Plus, Trash2, Sparkles } from "lucide-react";
import { addManualEntry, deleteTimeEntry } from "@/app/(app)/time-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/time";
import { PHASE_LABELS, PHASE_BADGE } from "@/lib/tasks";
import type { ModelPhase } from "@/generated/prisma/enums";

type Entry = {
  id: string;
  userName: string;
  durationSec: number;
  withAI: boolean;
  phase: ModelPhase | null;
  note: string | null;
  when: string;
  canDelete: boolean;
};

export function ManualTime({
  taskId,
  entries,
  totalSec,
  aiSec,
  noAiSec,
  showPhase,
  currentPhase,
}: {
  taskId: string;
  entries: Entry[];
  totalSec: number;
  aiSec: number;
  noAiSec: number;
  showPhase: boolean;
  currentPhase: ModelPhase;
}) {
  const defaultPhase: ModelPhase = currentPhase === "DONE" ? "TEXTURE" : currentPhase;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Apunta cuánto tiempo dedicaste a esta pieza (lo escribes tú; no hay
        cronómetro).
      </p>

      <form action={addManualEntry} className="space-y-2">
        <input type="hidden" name="taskId" value={taskId} />
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Horas</span>
            <Input name="hours" type="number" min={0} placeholder="1" className="h-9 w-16" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Minutos</span>
            <Input name="minutes" type="number" min={0} max={59} placeholder="30" className="h-9 w-20" />
          </div>
          {showPhase && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Fase</span>
              <select
                name="phase"
                defaultValue={defaultPhase}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="MESH">Malla</option>
                <option value="TEXTURE">Textura</option>
              </select>
            </div>
          )}
          <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground">
            <input type="checkbox" name="withAI" value="true" />
            <Sparkles className="size-3.5" /> Con IA
          </label>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <span className="text-xs text-muted-foreground">Nota (opcional)</span>
            <Input name="note" placeholder="¿Qué hiciste?" className="h-9" />
          </div>
          <Button type="submit" variant="outline" size="sm">
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
      </form>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge className="bg-slate-100 text-slate-700">Total: {formatDuration(totalSec)}</Badge>
        <Badge className="bg-primary/10 text-primary">Con IA: {formatDuration(aiSec)}</Badge>
        <Badge className="bg-slate-100 text-slate-600">Sin IA: {formatDuration(noAiSec)}</Badge>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay tiempo registrado.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatDuration(e.durationSec)}</span>
                  {e.phase && (
                    <Badge className={PHASE_BADGE[e.phase]}>{PHASE_LABELS[e.phase]}</Badge>
                  )}
                  {e.withAI && <Badge className="bg-primary/10 text-primary">IA</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {e.userName} · {e.when}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </div>
              {e.canDelete && (
                <form action={deleteTimeEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <button className="text-muted-foreground transition hover:text-red-600" title="Eliminar registro">
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
