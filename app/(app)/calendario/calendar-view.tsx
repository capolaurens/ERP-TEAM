"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { STATUS_DOT } from "@/lib/tasks";
import type { Priority, TaskStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type CalTask = {
  id: string;
  title: string;
  dayKey: string;
  status: TaskStatus;
  priority: Priority;
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function CalendarView({ tasks }: { tasks: CalTask[] }) {
  const [cursor, setCursor] = useState(() => new Date());

  const monthStart = startOfMonth(cursor);
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const arr = m.get(t.dayKey) ?? [];
      arr.push(t);
      m.set(t.dayKey, arr);
    }
    return m;
  }, [tasks]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-lg font-semibold capitalize">
          {format(cursor, "LLLL yyyy", { locale: es })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor((d) => subMonths(d, 1))}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Mes anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted"
          >
            Hoy
          </button>
          <button
            onClick={() => setCursor((d) => addMonths(d, 1))}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Mes siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, monthStart);
          return (
            <div
              key={i}
              className={cn(
                "min-h-24 border-b border-r border-border p-1.5",
                !inMonth && "bg-muted/30",
                (i + 1) % 7 === 0 && "border-r-0",
              )}
            >
              <div
                className={cn(
                  "mb-1 text-right text-xs",
                  !inMonth && "text-muted-foreground",
                  isToday(day) && "font-bold text-primary",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <Link
                    key={t.id}
                    href={`/tareas/${t.id}`}
                    className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] transition hover:bg-primary/10"
                  >
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[t.status])}
                    />
                    <span className="truncate">{t.title}</span>
                  </Link>
                ))}
                {dayTasks.length > 3 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{dayTasks.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
