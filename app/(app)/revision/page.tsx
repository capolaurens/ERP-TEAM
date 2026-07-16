import fs from "node:fs";
import path from "node:path";
import { CheckCircle2, MessageSquare, CircleDashed } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";

type ManItem = { file: string; fam: string; name: string; status: "listo" | "revision" };
type Filtro = "todos" | "comentados" | "visto-bueno" | "pendientes";

export const dynamic = "force-dynamic";

const TZ = "Europe/Madrid";
const fmtDate = new Intl.DateTimeFormat("es-ES", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function RevisionPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  await requireAdmin();
  const { f } = await searchParams;
  const filtro: Filtro = (["comentados", "visto-bueno", "pendientes"] as string[]).includes(f ?? "")
    ? (f as Filtro)
    : "todos";

  let manifest: ManItem[] = [];
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public", "northdeco", "manifest.json"), "utf8"),
    );
  } catch {}

  const [reviews, comments] = await Promise.all([
    prisma.northdecoReview.findMany({ where: { checked: true }, select: { file: true } }),
    prisma.northdecoComment.findMany({
      orderBy: { createdAt: "asc" },
      select: { file: true, author: true, text: true, createdAt: true },
    }),
  ]);
  const checked = new Set(reviews.map((r) => r.file));
  const byFile = new Map<string, { author: string | null; text: string; createdAt: Date }[]>();
  for (const c of comments) {
    const arr = byFile.get(c.file) ?? [];
    arr.push(c);
    byFile.set(c.file, arr);
  }

  const rows = manifest.map((m) => ({
    ...m,
    checked: checked.has(m.file),
    comments: byFile.get(m.file) ?? [],
  }));

  const nChecked = rows.filter((r) => r.checked).length;
  const nCommented = rows.filter((r) => r.comments.length > 0).length;
  const nPending = rows.filter((r) => !r.checked && r.comments.length === 0).length;

  const filtered = rows
    .filter((r) => {
      if (filtro === "comentados") return r.comments.length > 0;
      if (filtro === "visto-bueno") return r.checked;
      if (filtro === "pendientes") return !r.checked && r.comments.length === 0;
      return true;
    })
    .sort(
      (a, b) =>
        (b.comments.length > 0 ? 1 : 0) - (a.comments.length > 0 ? 1 : 0) ||
        (b.checked ? 1 : 0) - (a.checked ? 1 : 0) ||
        a.fam.localeCompare(b.fam),
    );

  const tabs: { k: Filtro; label: string; n: number }[] = [
    { k: "todos", label: "Todos", n: rows.length },
    { k: "comentados", label: "Con comentarios", n: nCommented },
    { k: "visto-bueno", label: "Visto bueno", n: nChecked },
    { k: "pendientes", label: "Sin revisar", n: nPending },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revisión del cliente</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Feedback de Northdeco en la galería 3D pública ·{" "}
          <a href="/northdeco" target="_blank" className="text-[#1f5450] underline underline-offset-2">
            abrir galería
          </a>{" "}
          · {rows.length} modelos
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<CheckCircle2 className="size-5" />} n={nChecked} label="Visto bueno del cliente" tone="ok" />
        <SummaryCard icon={<MessageSquare className="size-5" />} n={nCommented} label="Con comentarios (revisar)" tone="warn" />
        <SummaryCard icon={<CircleDashed className="size-5" />} n={nPending} label="Sin revisar todavía" tone="mute" />
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <a
            key={t.k}
            href={t.k === "todos" ? "/revision" : `/revision?f=${t.k}`}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filtro === t.k
                ? "border-transparent bg-[#1f5450] text-white"
                : "border-neutral-200 text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {t.label}
            <span className={`text-xs font-bold ${filtro === t.k ? "text-white/70" : "text-neutral-400"}`}>{t.n}</span>
          </a>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-400">
                  <th className="px-4 py-3 font-medium">Modelo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Comentarios</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-neutral-400">
                      No hay modelos en este filtro.
                    </td>
                  </tr>
                )}
                {filtered.map((r) => (
                  <tr
                    key={r.file}
                    className={`border-b border-neutral-50 align-top ${
                      r.comments.length > 0 ? "bg-amber-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{r.fam}</div>
                      <div className="text-xs text-neutral-500">{r.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "listo"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.status === "listo" ? "Listo" : "Cristal"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.checked ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
                          <CheckCircle2 className="size-4" /> Visto bueno
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.comments.length === 0 ? (
                        <span className="text-neutral-300">—</span>
                      ) : (
                        <ul className="space-y-1.5">
                          {r.comments.map((c, i) => (
                            <li key={i} className="text-[13px] leading-snug">
                              {c.author && <b className="text-neutral-800">{c.author}: </b>}
                              <span className="text-neutral-600">{c.text}</span>
                              <span className="ml-1 text-[11px] text-neutral-400">
                                · {fmtDate.format(c.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  n,
  label,
  tone,
}: {
  icon: React.ReactNode;
  n: number;
  label: string;
  tone: "ok" | "warn" | "mute";
}) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : "text-neutral-400";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`grid size-11 place-items-center rounded-xl bg-neutral-50 ${toneCls}`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold tabular-nums">{n}</div>
          <div className="text-xs text-neutral-500">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
