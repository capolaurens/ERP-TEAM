import { CheckCircle2, MessageSquare, CircleDashed } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { leerCatalogoConOrigen } from "@/lib/northdeco-catalogo";
import { escaneoDisponible } from "@/lib/northdeco-escaneo";

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

  // El catálogo sale de la BD (con caída al manifest si la tabla está sin
  // sembrar o Postgres falla). Se usa `ConOrigen` para poder AVISAR de que se
  // está sirviendo el respaldo: si no, el panel enseñaría datos viejos con toda
  // la naturalidad del mundo y nadie se enteraría.
  const { piezas, origen, motivoFallback } = await leerCatalogoConOrigen();
  const hayDrive = escaneoDisponible();

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

  const rows = piezas.map((m) => ({
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

  // Diccionario clave -> SKU/nombre para el panel. Los avisos y el escaneo
  // hablan en claves de archivo; quien mira el panel piensa en SKU.
  // El escape de "<" evita que un nombre raro cierre la etiqueta <script>.
  const catalogoJson = JSON.stringify(
    Object.fromEntries(piezas.map((p) => [p.file, { sku: p.sku, name: p.name }])),
  ).replace(/</g, "\\u003c");

  return (
    <div className="space-y-6">
      <style dangerouslySetInnerHTML={{ __html: CSS_PANEL }} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Revisión del cliente</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Feedback de Northdeco en la galería 3D pública ·{" "}
          <a href="/northdeco" target="_blank" className="text-[#1f5450] underline underline-offset-2">
            abrir galería
          </a>{" "}
          · {rows.length} modelos ·{" "}
          <a href="#control-3d" className="text-[#1f5450] underline underline-offset-2">
            ir a Control 3D
          </a>
        </p>
      </div>

      {origen === "manifest" && (
        <p className="nd-alerta">
          El catálogo se está sirviendo del <b>manifest.json del repositorio</b>, no de la base de
          datos: {motivoFallback} Mientras dure, dar de alta piezas está bloqueado y lo que se ve
          aquí es la foto congelada del último despliegue.
        </p>
      )}

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
                      <div className="font-semibold">{r.sku ?? r.fam}</div>
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

      {/* ───────────────────────── Control 3D ───────────────────────── */}
      {/* Todo lo de aquí abajo lo mueve /northdeco/panel.js: los contenedores
          salen VACÍOS del servidor y el script los rellena al pulsar cada
          botón. Nada se carga solo porque el trabajo es caro (Drive). */}
      <div id="control-3d" className="nd-panel" data-nd-panel>
        <script
          type="application/json"
          data-nd-catalogo
          dangerouslySetInnerHTML={{ __html: catalogoJson }}
        />

        <div className="nd-cab">
          <h2>Control 3D</h2>
          <p>
            Estado real de los archivos en Drive frente a lo que enseña la galería. Solo lectura
            salvo el botón de publicar. Catálogo servido desde{" "}
            <b>{origen === "bd" ? "la base de datos" : "manifest.json (respaldo)"}</b>.
          </p>
        </div>

        {!hayDrive && (
          <p className="nd-alerta">
            Google Drive no está configurado en este entorno (falta{" "}
            <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>): el escaneo, los avisos y las fichas técnicas
            no pueden funcionar.
          </p>
        )}

        {/* --- 1. Escaneo --- */}
        <section className="nd-bloque">
          <div className="nd-bloque-cab">
            <h3>1 · Escanear Drive</h3>
            <div className="nd-bloque-ctl">
              <select data-nd-alcance defaultValue="publicadas" aria-label="Alcance del escaneo">
                <option value="publicadas">Solo las familias de la galería (~2 s)</option>
                <option value="todo">Todo el Drive · 182 carpetas (~6 s)</option>
              </select>
              <button type="button" className="nd-btn" data-nd-escanear disabled={!hayDrive}>
                Escanear Drive
              </button>
            </div>
          </div>
          <p className="nd-nota">
            Compara carpeta a carpeta lo que hay en Drive con el catálogo. «Todo el Drive» saca
            también las ~170 familias que nunca han entrado en la galería: útil para dar de alta una
            tanda nueva, ruidoso para el día a día.
          </p>
          <div className="nd-estado" data-nd-estado="escaneo" />
          <div data-nd-res="escaneo" />
        </section>

        {/* --- 2. Avisos --- */}
        <section className="nd-bloque">
          <div className="nd-bloque-cab">
            <h3>2 · Avisos</h3>
            <div className="nd-bloque-ctl">
              <label className="nd-check">
                <input type="checkbox" data-nd-cabeceras defaultChecked />
                Leer la geometría de cada GLB
              </label>
              <button type="button" className="nd-btn" data-nd-avisos disabled={!hayDrive}>
                Analizar avisos
              </button>
            </div>
          </div>
          <p className="nd-nota">
            Archivos en la papelera, erratas de SKU que hacen servir el id congelado, pesos
            desbocados, mallas repetidas y carpetas duplicadas. Sin la geometría tarda ~10 s en vez
            de ~25, pero se pierden los avisos de malla repetida y sin texturizar.
          </p>
          <div className="nd-estado" data-nd-estado="avisos" />
          <div data-nd-res="avisos" />
        </section>

        {/* --- 3. Ficha técnica --- */}
        <section className="nd-bloque">
          <div className="nd-bloque-cab">
            <h3>3 · Datos técnicos por pieza</h3>
            <div className="nd-bloque-ctl">
              <label className="nd-check">
                <input type="checkbox" data-nd-pesados />
                Solo pesadas
              </label>
              <label className="nd-check">
                <input type="checkbox" data-nd-porpeso />
                Ordenar por peso
              </label>
              <button type="button" className="nd-btn" data-nd-tecnico disabled={!hayDrive}>
                Cargar datos técnicos
              </button>
            </div>
          </div>
          <p className="nd-nota">
            Del archivo que la galería sirve DE VERDAD (el que resuelve por nombre), no del id
            guardado en la ficha. Los pesos por encima del umbral salen resaltados.
          </p>
          <div className="nd-estado" data-nd-estado="tecnico" />
          <div data-nd-res="tecnico" />
        </section>
      </div>

      {/*
        <script> pelado y no next/script a propósito: así el panel no depende de
        que React llegue a hidratar esta página. El navegador lo ejecuta al
        terminar de leer el HTML y el script solo escribe en contenedores que el
        servidor deja vacíos, así que no hay nada que React pueda pisar.
      */}
      <script defer src="/northdeco/panel.js?v=1" />
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

/**
 * CSS propio en vez de Tailwind: el HTML de las tablas lo genera panel.js en
 * tiempo de ejecución, y Tailwind solo compila las clases que ve en el código
 * fuente. Con utilidades sueltas en un .js el panel saldría sin estilos.
 * Todo va dentro de `.nd-panel` para no tocar el resto del ERP.
 */
const CSS_PANEL = `
.nd-alerta{background:#fdecea;border:1px solid #f5c2bd;color:#8a2318;border-radius:12px;
  padding:10px 14px;font-size:13px;line-height:1.5;margin:0}
.nd-alerta code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px}
.nd-panel{--l:var(--border);--m:var(--muted-foreground);
  background:var(--card);border:1px solid var(--l);border-radius:16px;padding:20px;
  display:flex;flex-direction:column;gap:18px;scroll-margin-top:20px}
.nd-panel h2{font-size:18px;font-weight:700;margin:0}
.nd-panel h3{font-size:14px;font-weight:700;margin:0}
.nd-cab p{margin:4px 0 0;font-size:13px;color:var(--m);line-height:1.5}
.nd-bloque{border-top:1px solid var(--l);padding-top:16px;display:flex;flex-direction:column;gap:10px}
.nd-bloque-cab{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.nd-bloque-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.nd-nota{margin:0;font-size:12.5px;color:var(--m);line-height:1.5;max-width:95ch}
.nd-btn{font:inherit;font-size:13px;font-weight:600;background:var(--primary);color:#fff;
  border:0;border-radius:9px;padding:7px 14px;cursor:pointer}
.nd-btn:hover:not(:disabled){filter:brightness(.94)}
.nd-btn:disabled{opacity:.45;cursor:not-allowed}
.nd-btn-sec{background:transparent;color:var(--foreground);border:1px solid var(--l)}
.nd-panel select{font:inherit;font-size:13px;background:var(--card);color:inherit;
  border:1px solid var(--l);border-radius:9px;padding:7px 10px}
.nd-check{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--m);cursor:pointer}
.nd-estado{font-size:12.5px;color:var(--m);min-height:18px;font-variant-numeric:tabular-nums}
.nd-estado:empty{display:none}
.nd-cargando{color:var(--primary)}
.nd-ok{color:#1a7f4b}
.nd-error{color:#b3261e}
.nd-h4{margin:16px 0 6px;font-size:13px;font-weight:700}
.nd-grav-alta{color:#b3261e}
.nd-grav-media{color:#8a5a00}
.nd-grav-baja{color:var(--m)}
.nd-vacio{margin:4px 0;font-size:12.5px;color:var(--m);font-style:italic}
.nd-sub{font-size:11.5px;color:var(--m)}
.nd-resumen{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 4px}
.nd-chip{font-size:11.5px;color:var(--m);background:var(--muted);border-radius:100px;padding:3px 10px}
.nd-chip b{color:var(--foreground);font-variant-numeric:tabular-nums}
.nd-chip-avisa{background:#fdf1dc;color:#8a5a00}
.nd-chip-avisa b{color:#8a5a00}
.nd-chip-mal{background:#fdecea;color:#8a2318}
.nd-chip-mal b{color:#8a2318}
.nd-acciones{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:6px 0}
.nd-scroll{overflow-x:auto;border:1px solid var(--l);border-radius:11px}
.nd-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.nd-tbl th{text-align:left;font-weight:600;font-size:10.5px;letter-spacing:.05em;
  text-transform:uppercase;color:var(--m);padding:8px 10px;border-bottom:1px solid var(--l);
  white-space:nowrap;background:var(--muted)}
.nd-tbl td{padding:7px 10px;border-bottom:1px solid var(--l);vertical-align:top}
.nd-tbl tr:last-child td{border-bottom:0}
.nd-tbl code{font-size:11.5px;background:var(--muted);padding:1px 5px;border-radius:4px;
  word-break:break-all}
.nd-r{text-align:right}
.nd-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.nd-fila-avisa{background:#fffaf0}
.nd-fila-mal{background:#fdf3f2}
.nd-peso-alto{color:#b3261e;font-weight:700}
.nd-aviso-celda{color:#8a5a00;max-width:44ch}
.nd-etq{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;background:var(--muted);color:var(--m);border-radius:100px;padding:1px 7px}
.nd-etq-mal{background:#fdecea;color:#8a2318}
.nd-link{color:var(--primary);text-decoration:none;font-weight:600}
.nd-link:hover{text-decoration:underline}
.nd-avisos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
.nd-aviso{border:1px solid var(--l);border-left:3px solid var(--m);border-radius:10px;
  padding:9px 12px;display:flex;flex-direction:column;gap:3px}
.nd-aviso-alta{border-left-color:#b3261e;background:#fdf3f2}
.nd-aviso-media{border-left-color:#c98a12;background:#fffaf0}
.nd-aviso-cab{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.nd-tipo{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  background:var(--muted);color:var(--m);border-radius:100px;padding:2px 8px}
.nd-sku{font-size:13px;font-weight:700}
.nd-aviso-msg{font-size:12.5px;line-height:1.5}
`;
