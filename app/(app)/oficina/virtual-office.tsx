"use client";

import { useEffect, useState } from "react";
import { Wifi } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";

type OnlineUser = { id: string; name: string; role: Role; team: string | null };

const POSITIONS = [
  { x: 18, y: 32 },
  { x: 39, y: 26 },
  { x: 61, y: 28 },
  { x: 82, y: 34 },
  { x: 26, y: 56 },
  { x: 50, y: 52 },
  { x: 72, y: 56 },
  { x: 88, y: 64 },
  { x: 16, y: 80 },
  { x: 38, y: 82 },
  { x: 60, y: 82 },
  { x: 82, y: 86 },
];

function avatarUrl(seed: string) {
  return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&radius=10`;
}

export function VirtualOffice({ meId }: { meId: string }) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const r = await fetch("/api/presence", { cache: "no-store" });
        const d = await r.json();
        if (active) {
          setOnline(d.online ?? []);
          setLoaded(true);
        }
      } catch {
        /* ignore */
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
          <Wifi className="size-4" />
          {online.length} conectado{online.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground">Se actualiza en vivo.</span>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border shadow-inner"
        style={{
          aspectRatio: "16 / 9",
          minHeight: 420,
          background:
            "linear-gradient(180deg,#2b2b2b 0%,#2b2b2b 17%,#efe7da 17%,#e7ddcc 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 top-[17%] opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(#d4c8b4 1px, transparent 1px), linear-gradient(90deg,#d4c8b4 1px, transparent 1px)",
            backgroundSize: "46px 46px",
          }}
        />
        <div className="absolute left-4 top-3 text-xs font-bold tracking-widest text-white/70">
          NAVYX · HQ
        </div>

        {!loaded ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            Cargando oficina…
          </div>
        ) : online.length === 0 ? (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No hay nadie conectado ahora mismo.
          </div>
        ) : (
          online.map((u, i) => {
            const pos = POSITIONS[i % POSITIONS.length];
            const isMe = u.id === meId;
            return (
              <div
                key={u.id}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <div className="absolute bottom-2 h-2 w-10 rounded-full bg-black/20 blur-[1px]" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl(u.name || u.id)}
                  alt={u.name}
                  className="size-16 [image-rendering:pixelated]"
                  style={{
                    animation: `office-bob 2.6s ease-in-out ${(i % 5) * 0.35}s infinite`,
                  }}
                />
                <div
                  className={
                    "mt-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs shadow-sm " +
                    (isMe
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground")
                  }
                >
                  <span className="size-1.5 rounded-full bg-green-400" />
                  {u.name}
                  {isMe ? " (tú)" : ""}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {ROLE_LABELS[u.role] ?? u.role}
                </div>
              </div>
            );
          })
        )}
      </div>

      {online.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {online.map((u) => (
              <span
                key={u.id}
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"
              >
                <span className="size-1.5 rounded-full bg-green-500" />
                {u.name}
                <span className="text-muted-foreground">
                  · {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
