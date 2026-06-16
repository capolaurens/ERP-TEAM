"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Square } from "lucide-react";
import { stopTimer } from "@/app/(app)/time-actions";
import { formatClock } from "@/lib/time";

export function TopbarTimer({
  running,
}: {
  running: { startedAt: string; taskTitle: string; taskId: string } | null;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const start = new Date(running.startedAt).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [running?.startedAt, running]);

  if (!running) return null;

  return (
    <div className="ml-3 hidden items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 sm:flex">
      <span className="size-2 animate-pulse rounded-full bg-primary" />
      <span className="font-mono text-sm font-semibold tabular-nums">
        {formatClock(elapsed)}
      </span>
      <Link
        href={`/tareas/${running.taskId}`}
        className="max-w-36 truncate text-xs text-muted-foreground hover:text-foreground"
        title={running.taskTitle}
      >
        {running.taskTitle}
      </Link>
      <form action={stopTimer}>
        <button
          type="submit"
          className="text-muted-foreground transition hover:text-red-600"
          title="Parar cronómetro"
        >
          <Square className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
