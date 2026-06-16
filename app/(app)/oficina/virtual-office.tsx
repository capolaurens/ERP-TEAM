"use client";

import { useEffect, useState } from "react";
import { Wifi } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import { Card, CardContent } from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";

type OnlineUser = { id: string; name: string; role: Role; team: string | null };

type RoomKey = "CEO" | "CFO" | "MARKETING" | "DIGITAL3D";

const ROOMS: {
  key: RoomKey;
  name: string;
  floor: string;
  sign: string;
  deco: string[];
}[] = [
  { key: "CEO", name: "CEO", floor: "#f3ead2", sign: "bg-amber-200 text-amber-800", deco: ["🖥️", "🏆", "🪴"] },
  { key: "CFO", name: "CFO", floor: "#e2efe3", sign: "bg-green-200 text-green-800", deco: ["🖥️", "📊", "🪴"] },
  { key: "MARKETING", name: "MARKETING", floor: "#fce4da", sign: "bg-orange-200 text-orange-800", deco: ["🖥️", "📣", "🪴"] },
  { key: "DIGITAL3D", name: "DIGITAL 3D", floor: "#e1eaf7", sign: "bg-blue-200 text-blue-800", deco: ["🖥️", "🎨", "🪴"] },
];

function roomFor(u: OnlineUser): RoomKey {
  if (u.role === "ADMIN") return "CEO";
  if (u.role === "SALES") return "CFO";
  if (u.role === "DESIGN") return "DIGITAL3D";
  return "MARKETING";
}

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

  const byRoom = (key: RoomKey) => online.filter((u) => roomFor(u) === key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
          <Wifi className="size-4" />
          {online.length} en la oficina
        </span>
        <span className="text-muted-foreground">Se actualiza en vivo.</span>
      </div>

      {/* Edificio (vista cenital estilo Pokémon) */}
      <div className="overflow-hidden rounded-2xl border-4 border-[#2b2b2b] bg-[#2b2b2b] p-2 shadow-xl">
        <div className="grid grid-cols-2 gap-2">
          {ROOMS.map((room) => {
            const members = byRoom(room.key);
            return (
              <div
                key={room.key}
                className="relative min-h-[270px] overflow-hidden rounded-lg"
                style={{ background: room.floor }}
              >
                {/* baldosas */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(0,0,0,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.12) 1px,transparent 1px)",
                    backgroundSize: "34px 34px",
                  }}
                />
                {/* cartel de la sala */}
                <div
                  className={`absolute left-2 top-2 z-10 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-widest shadow-sm ${room.sign}`}
                >
                  {room.name}
                </div>
                <div className="absolute right-2 top-2 z-10 text-[11px] font-medium text-black/40">
                  {members.length}
                </div>
                {/* decoración */}
                <div className="pointer-events-none absolute bottom-2 left-2 text-2xl">
                  {room.deco[0]}
                </div>
                <div className="pointer-events-none absolute right-2 top-8 text-2xl">
                  {room.deco[1]}
                </div>
                <div className="pointer-events-none absolute bottom-2 right-2 text-2xl">
                  {room.deco[2]}
                </div>

                {/* sims */}
                <div className="flex h-full min-h-[270px] flex-wrap content-center items-center justify-center gap-x-5 gap-y-3 p-10">
                  {members.length === 0 ? (
                    <span className="text-xs text-black/30">— vacío —</span>
                  ) : (
                    members.map((u, i) => {
                      const isMe = u.id === meId;
                      return (
                        <div key={u.id} className="flex flex-col items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatarUrl(u.name || u.id)}
                            alt={u.name}
                            className="size-14 [image-rendering:pixelated] drop-shadow"
                            style={{
                              animation: `office-bob 2.6s ease-in-out ${(i % 5) * 0.3}s infinite`,
                            }}
                          />
                          <div
                            className={
                              "mt-0.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] shadow-sm " +
                              (isMe
                                ? "bg-primary text-primary-foreground"
                                : "bg-white/90 text-foreground")
                            }
                          >
                            <span className="size-1.5 rounded-full bg-green-500" />
                            {u.name}
                            {isMe ? " (tú)" : ""}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* lista de conectados */}
      {loaded && online.length > 0 && (
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
