"use client";

import { useEffect, useState } from "react";
import { Wifi, Bot } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import { dicebearUrl, effectiveSeed } from "@/lib/avatars";
import { Card, CardContent } from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";

type OnlineUser = {
  id: string;
  name: string;
  role: Role;
  team: string | null;
  avatarSeed?: string | null;
};

type RoomKey = "CEO" | "MEETING" | "MARKETING" | "DIGITAL3D";

/* ------------------------------------------------------------------ */
/*  Bots de la sala de reuniones (placeholder — editar con los reales) */
/* ------------------------------------------------------------------ */
const BOTS: { id: string; name: string; short: string; seed: string }[] = [
  { id: "asistente", name: "Asistente", short: "Asistente", seed: "navyx-helper" },
  { id: "comercial", name: "Comercial", short: "Comercial", seed: "navyx-sales" },
  { id: "setter", name: "Setter", short: "Setter", seed: "navyx-setter" },
];

/* Orden de asientos para repartir los bots por la mesa (no contiguos). */
const SEAT_ORDER = [0, 2, 4, 1, 3, 5];

function botsUrl(seed: string) {
  return `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

/* Asientos de la mesa de reuniones (en % del lienzo, alineados con las sillas). */
const BOT_SEATS = [
  { left: 65.6, top: 63 },
  { left: 76.2, top: 62.4 },
  { left: 86.8, top: 63 },
  { left: 65.6, top: 86 },
  { left: 76.2, top: 86.6 },
  { left: 86.8, top: 86 },
];

/* Zona donde se colocan las personas dentro de cada sala (en % del lienzo). */
const PEOPLE_ZONE: Record<RoomKey, { x0: number; x1: number; y0: number; y1: number }> = {
  CEO: { x0: 10, x1: 43, y0: 27, y1: 43 },
  MARKETING: { x0: 56, x1: 92, y0: 27, y1: 43 },
  DIGITAL3D: { x0: 9, x1: 45, y0: 72, y1: 90 },
  MEETING: { x0: 54, x1: 61.5, y0: 62, y1: 86 },
};

const ROOM_LABELS: {
  key: RoomKey;
  name: string;
  emoji: string;
  pos: { left: number; top: number };
  cls: string;
}[] = [
  { key: "CEO", name: "CEO", emoji: "👔", pos: { left: 4.5, top: 6.5 }, cls: "bg-amber-100 text-amber-900 border-amber-300" },
  { key: "MARKETING", name: "MARKETING", emoji: "📣", pos: { left: 53.5, top: 6.5 }, cls: "bg-orange-100 text-orange-900 border-orange-300" },
  { key: "DIGITAL3D", name: "DIGITAL 3D", emoji: "🎨", pos: { left: 4.5, top: 53 }, cls: "bg-sky-100 text-sky-900 border-sky-300" },
  { key: "MEETING", name: "SALA DE REUNIONES", emoji: "🤝", pos: { left: 53.5, top: 53 }, cls: "bg-stone-100 text-stone-800 border-stone-300" },
];

function roomFor(u: OnlineUser): RoomKey {
  if (u.role === "ADMIN") return "CEO";
  if (u.role === "SALES") return "MEETING";
  if (u.role === "DESIGN") return "DIGITAL3D";
  return "MARKETING";
}

function layout(n: number, box: { x0: number; x1: number; y0: number; y1: number }) {
  const cols = Math.min(3, Math.max(1, n));
  const rows = Math.ceil(n / cols);
  const out: { left: number; top: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const colsInRow = Math.min(cols, n - r * cols);
    const x = box.x0 + (box.x1 - box.x0) * ((c + 0.5) / colsInRow);
    const y = box.y0 + (box.y1 - box.y0) * ((r + 0.5) / rows);
    out.push({ left: x, top: y });
  }
  return out;
}

/* ============================ SVG: piezas ============================ */

function Rug({ x, y, w, h, fill, stroke }: { x: number; y: number; w: number; h: number; fill: string; stroke: string }) {
  return (
    <g opacity={0.92}>
      <rect x={x} y={y} width={w} height={h} rx={20} fill={fill} />
      <rect x={x + 9} y={y + 9} width={w - 18} height={h - 18} rx={14} fill="none" stroke={stroke} strokeWidth={3.5} opacity={0.7} />
    </g>
  );
}

function Shadow({ cx, cy, rx, ry = 8 }: { cx: number; cy: number; rx: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="rgba(0,0,0,0.16)" />;
}

function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cx={0} cy={36} rx={20} ry={6} fill="rgba(0,0,0,0.15)" />
      <path d="M-13 16 L13 16 L10 36 L-10 36 Z" fill="#c87f4a" />
      <path d="M-13 16 L13 16 L12 22 L-12 22 Z" fill="#a9663a" />
      <circle cx={0} cy={2} r={16} fill="#4e9a51" />
      <circle cx={-10} cy={9} r={11} fill="#5cae5f" />
      <circle cx={10} cy={9} r={11} fill="#43904a" />
      <circle cx={0} cy={-6} r={9} fill="#67ba69" />
    </g>
  );
}

function Monitor({ x, y, screen = "#7fd1e6" }: { x: number; y: number; screen?: string }) {
  return (
    <g>
      <rect x={x} y={y + 24} width={28} height={6} rx={2} fill="#2b2f36" />
      <rect x={x - 3} y={y - 2} width={34} height={24} rx={3} fill="#2b2f36" />
      <rect x={x + 1} y={y + 2} width={26} height={16} rx={2} fill={screen} />
    </g>
  );
}

function Chair({ x, y, fill = "#39414d" }: { x: number; y: number; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={30} height={28} rx={9} fill={fill} />
      <rect x={x + 4} y={y - 7} width={22} height={11} rx={5} fill={fill} opacity={0.75} />
    </g>
  );
}

function Desk({ x, y, w = 200, h = 50, top = "#bd8551", edge = "#8a5d34" }: { x: number; y: number; w?: number; h?: number; top?: string; edge?: string }) {
  return (
    <g>
      <rect x={x} y={y + h - 9} width={w} height={12} rx={5} fill="rgba(0,0,0,0.12)" />
      <rect x={x} y={y} width={w} height={h} rx={9} fill={edge} />
      <rect x={x} y={y} width={w} height={h - 9} rx={9} fill={top} />
      <rect x={x + 10} y={y + 7} width={w * 0.42} height={5} rx={2.5} fill="rgba(255,255,255,0.18)" />
    </g>
  );
}

function Shelf({ x, y, w = 110, h = 24, fill = "#7a5236" }: { x: number; y: number; w?: number; h?: number; fill?: string }) {
  const books = ["#d2544e", "#e0a23c", "#5aa9d6", "#6bbf73", "#b06fc4", "#d2544e", "#e0a23c"];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} />
      {books.map((c, i) => (
        <rect key={i} x={x + 6 + i * ((w - 12) / books.length)} y={y + 4} width={(w - 12) / books.length - 3} height={h - 8} rx={1.5} fill={c} />
      ))}
    </g>
  );
}

function Sofa({ x, y, w = 150, h = 46, fill = "#e88a5a" }: { x: number; y: number; w?: number; h?: number; fill?: string }) {
  return (
    <g>
      <rect x={x} y={y + h - 8} width={w} height={11} rx={5} fill="rgba(0,0,0,0.12)" />
      <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} />
      <rect x={x + 8} y={y + 8} width={w - 16} height={h - 16} rx={9} fill="#fff" opacity={0.18} />
      <rect x={x + 12} y={y + 6} width={(w - 24) / 2 - 4} height={h - 14} rx={7} fill="#fff" opacity={0.12} />
    </g>
  );
}

function Screen({ x, y, w = 150, h = 26 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#2c2f36" />
      <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={2} fill="#3b4a63" />
      <rect x={x + 10} y={y + 9} width={w * 0.5} height={4} rx={2} fill="#7fd1e6" opacity={0.8} />
      <rect x={x + 10} y={y + 17} width={w * 0.3} height={3} rx={1.5} fill="#9fb7d6" opacity={0.6} />
    </g>
  );
}

function Window({ x, y, w = 90, h = 16 }: { x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#bfe6f2" stroke="#7fb6cc" strokeWidth={2} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#7fb6cc" strokeWidth={2} />
    </g>
  );
}

function Printer3D({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y + 46} width={60} height={9} rx={4} fill="rgba(0,0,0,0.12)" />
      <rect x={x} y={y} width={60} height={52} rx={6} fill="#2f343c" />
      <rect x={x + 6} y={y + 8} width={48} height={30} rx={3} fill="#454c57" />
      <rect x={x + 6} y={y + 6} width={48} height={5} rx={2} fill="#ef6b3b" />
      <circle cx={x + 30} cy={y + 24} r={6} fill="#7fd1e6" />
    </g>
  );
}

function ServerRack({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={46} height={62} rx={5} fill="#23262c" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={x + 5} y={y + 7 + i * 14} width={36} height={9} rx={2} fill="#343a43" />
          <circle cx={x + 11} cy={y + 11.5 + i * 14} r={2} fill={i % 2 ? "#6bbf73" : "#ef6b3b"} />
          <circle cx={x + 18} cy={y + 11.5 + i * 14} r={2} fill="#7fd1e6" />
        </g>
      ))}
    </g>
  );
}

function ConfTable({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <ellipse cx={x + w / 2} cy={y + h + 4} rx={w / 2} ry={13} fill="rgba(0,0,0,0.14)" />
      <rect x={x} y={y} width={w} height={h} rx={30} fill="#4f3826" />
      <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={24} fill="#6b4c34" />
      <rect x={x + 18} y={y + 16} width={w - 36} height={h - 32} rx={16} fill="#7d5a3e" />
      <rect x={x + 30} y={y + 24} width={w * 0.34} height={9} rx={4} fill="rgba(255,255,255,0.10)" />
      {/* portátiles sobre la mesa */}
      {[0.27, 0.73].map((p, i) => (
        <g key={i}>
          <rect x={x + w * p - 14} y={y + h / 2 - 9} width={28} height={18} rx={2} fill="#2c2f36" />
          <rect x={x + w * p - 11} y={y + h / 2 - 6} width={22} height={12} rx={1.5} fill="#7fd1e6" />
        </g>
      ))}
    </g>
  );
}

/* ============================ Escena ============================ */

function OfficeScene() {
  return (
    <svg viewBox="0 0 1000 760" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="off-planks" width="46" height="46" patternUnits="userSpaceOnUse">
          <path d="M0 0 V46" stroke="rgba(0,0,0,0.06)" strokeWidth="2" />
          <path d="M0 23 H46" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        </pattern>
        <pattern id="off-tiles" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0 V50 M0 50 H50" stroke="rgba(0,0,0,0.06)" strokeWidth="1.5" />
        </pattern>
        <linearGradient id="off-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b88b5e" />
          <stop offset="1" stopColor="#9a6e46" />
        </linearGradient>
      </defs>

      {/* ---- suelos de las 4 salas ---- */}
      <rect x={24} y={24} width={464} height={344} fill="#c99c66" />
      <rect x={24} y={24} width={464} height={344} fill="url(#off-planks)" />
      <rect x={512} y={24} width={464} height={344} fill="#edc9ad" />
      <rect x={512} y={24} width={464} height={344} fill="url(#off-tiles)" />
      <rect x={24} y={392} width={464} height={344} fill="#bcc8d8" />
      <rect x={24} y={392} width={464} height={344} fill="url(#off-tiles)" />
      <rect x={512} y={392} width={464} height={344} fill="#cfbd96" />
      <rect x={512} y={392} width={464} height={344} fill="url(#off-planks)" />

      {/* ---- alfombras ---- */}
      <Rug x={120} y={188} w={290} h={150} fill="#8d2f33" stroke="#d8b25a" />
      <Rug x={612} y={196} w={300} h={140} fill="#ef915f" stroke="#ffffff" />
      <Rug x={96} y={560} w={300} h={150} fill="#3f6ea5" stroke="#cfe0f2" />
      <Rug x={596} y={486} w={344} h={210} fill="#727a86" stroke="#aab2bd" />

      {/* =================== CEO =================== */}
      <Shelf x={44} y={36} w={150} h={26} fill="#7a5236" />
      <Window x={210} y={6} w={120} h={14} />
      <Desk x={150} y={70} w={210} h={52} top="#3f3a55" edge="#2c2840" />
      <Monitor x={236} y={78} screen="#9ad0ff" />
      <Chair x={245} y={132} fill="#2b2840" />
      <Plant x={64} y={300} s={1.15} />
      <Plant x={430} y={300} s={1} />

      {/* =================== MARKETING =================== */}
      <Window x={690} y={6} w={120} h={14} />
      <Shelf x={830} y={36} w={120} h={24} fill="#8a5a3a" />
      <Desk x={560} y={74} w={150} h={48} top="#d98f57" edge="#a5652f" />
      <Monitor x={620} y={80} screen="#ffd28a" />
      <Desk x={770} y={74} w={150} h={48} top="#d98f57" edge="#a5652f" />
      <Monitor x={830} y={80} screen="#ffb0c4" />
      <Sofa x={636} y={296} w={170} h={48} fill="#e8825a" />
      <Plant x={930} y={300} s={1.1} />

      {/* =================== DIGITAL 3D =================== */}
      <Shelf x={44} y={404} w={130} h={24} fill="#3a4a63" />
      <ServerRack x={420} y={406} />
      <Desk x={90} y={452} w={150} h={48} top="#46566e" edge="#2f3c4f" />
      <Monitor x={108} y={458} screen="#8be0ff" />
      <Monitor x={150} y={458} screen="#8be0ff" />
      <Desk x={280} y={452} w={150} h={48} top="#46566e" edge="#2f3c4f" />
      <Monitor x={298} y={458} screen="#a0ffd8" />
      <Monitor x={340} y={458} screen="#a0ffd8" />
      <Printer3D x={58} y={640} />
      <Plant x={440} y={690} s={1.05} />

      {/* =================== SALA DE REUNIONES =================== */}
      <Screen x={690} y={404} w={170} h={28} />
      <ConfTable x={612} y={506} w={300} h={126} />
      {/* sillas de la mesa */}
      <Chair x={641} y={472} fill="#3a4250" />
      <Chair x={747} y={470} fill="#3a4250" />
      <Chair x={853} y={472} fill="#3a4250" />
      <Chair x={641} y={650} fill="#3a4250" />
      <Chair x={747} y={652} fill="#3a4250" />
      <Chair x={853} y={650} fill="#3a4250" />
      <Plant x={935} y={690} s={1.1} />
      <Plant x={540} y={420} s={0.95} />

      {/* ---- paredes (con puertas) ---- */}
      <g fill="url(#off-wall)" stroke="#5b4127" strokeWidth={2}>
        {/* marco exterior */}
        <rect x={0} y={0} width={1000} height={24} />
        <rect x={0} y={736} width={1000} height={24} />
        <rect x={0} y={0} width={24} height={760} />
        <rect x={976} y={0} width={24} height={760} />
        {/* muro vertical central (huecos = puertas) */}
        <rect x={488} y={24} width={24} height={126} />
        <rect x={488} y={230} width={24} height={310} />
        <rect x={488} y={620} width={24} height={116} />
        {/* muro horizontal central (huecos = puertas) */}
        <rect x={24} y={368} width={126} height={24} />
        <rect x={230} y={368} width={530} height={24} />
        <rect x={840} y={368} width={136} height={24} />
      </g>
      {/* brillo interior de las paredes */}
      <g stroke="#d8b387" strokeWidth={2} opacity={0.5} fill="none">
        <line x1={24} y1={25} x2={976} y2={25} />
        <line x1={25} y1={24} x2={25} y2={736} />
      </g>
    </svg>
  );
}

/* ============================ Componente ============================ */

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

  // posiciones de las personas por sala
  const placed: { u: OnlineUser; left: number; top: number }[] = [];
  (Object.keys(PEOPLE_ZONE) as RoomKey[]).forEach((key) => {
    const members = byRoom(key);
    const pts = layout(members.length, PEOPLE_ZONE[key]);
    members.forEach((u, i) => placed.push({ u, left: pts[i].left, top: pts[i].top }));
  });

  const counts: Record<RoomKey, number> = {
    CEO: byRoom("CEO").length,
    MARKETING: byRoom("MARKETING").length,
    DIGITAL3D: byRoom("DIGITAL3D").length,
    MEETING: byRoom("MEETING").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
          <Wifi className="size-4" />
          {online.length} en la oficina
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-600">
          <Bot className="size-4" />
          {BOTS.length} bots activos
        </span>
        <span className="text-muted-foreground">Se actualiza en vivo.</span>
      </div>

      {/* ---- edificio ---- */}
      <div className="mx-auto w-full max-w-5xl">
        <div className="relative aspect-[1000/760] w-full overflow-hidden rounded-2xl border-4 border-[#5b4127] shadow-xl">
          <OfficeScene />

          {/* carteles de las salas */}
          {ROOM_LABELS.map((r) => (
            <div
              key={r.key}
              className="absolute z-10 flex items-center gap-1.5"
              style={{ left: `${r.pos.left}%`, top: `${r.pos.top}%` }}
            >
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider shadow-sm sm:text-xs ${r.cls}`}>
                {r.emoji} {r.name}
              </span>
              <span className="rounded-full bg-black/30 px-1.5 text-[10px] font-semibold text-white">
                {counts[r.key]}
              </span>
            </div>
          ))}

          {/* bots sentados en la sala de reuniones */}
          {BOTS.slice(0, BOT_SEATS.length).map((b, i) => {
            const seat = BOT_SEATS[SEAT_ORDER[i] ?? i];
            return (
              <div
                key={b.id}
                className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${seat.left}%`, top: `${seat.top}%` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={botsUrl(b.seed)}
                  alt={b.name}
                  className="drop-shadow-[0_3px_2px_rgba(0,0,0,0.35)]"
                  style={{ width: "clamp(26px,3.1vw,44px)", animation: `office-bob 3s ease-in-out ${i * 0.25}s infinite` }}
                />
                <span className="mt-0.5 flex items-center gap-1 rounded-full bg-stone-800/90 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-sm sm:text-[10px]">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  {b.short}
                </span>
              </div>
            );
          })}

          {/* personas conectadas */}
          {placed.map(({ u, left, top }, i) => {
            const isMe = u.id === meId;
            return (
              <div
                key={u.id}
                className="absolute z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dicebearUrl(effectiveSeed(u.avatarSeed, u.name || u.id))}
                  alt={u.name}
                  className="[image-rendering:pixelated] drop-shadow-[0_3px_2px_rgba(0,0,0,0.4)]"
                  style={{ width: "clamp(30px,3.6vw,52px)", animation: `office-bob 2.6s ease-in-out ${(i % 5) * 0.3}s infinite` }}
                />
                <span
                  className={
                    "mt-0.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium shadow-sm sm:text-[10px] " +
                    (isMe ? "bg-primary text-primary-foreground" : "bg-white/95 text-foreground")
                  }
                >
                  <span className="size-1.5 rounded-full bg-green-500" />
                  {u.name}
                  {isMe ? " (tú)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* listas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {loaded && online.length > 0 && (
          <Card>
            <CardContent className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Wifi className="size-4 text-green-600" /> Personas conectadas
              </p>
              <div className="flex flex-wrap gap-2 text-sm">
                {online.map((u) => (
                  <span key={u.id} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                    <span className="size-1.5 rounded-full bg-green-500" />
                    {u.name}
                    <span className="text-muted-foreground">· {ROLE_LABELS[u.role] ?? u.role}</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Bot className="size-4 text-stone-600" /> Bots activos
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              {BOTS.map((b) => (
                <span key={b.id} className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {b.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
