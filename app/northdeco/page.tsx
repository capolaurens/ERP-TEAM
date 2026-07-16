import fs from "node:fs";
import path from "node:path";

export const metadata = {
  title: "Catálogo 3D · Northdeco — NAVYX",
  description:
    "Galería 3D interactiva del catálogo de Northdeco. Gira cada mueble 360° y pruébalo en tu espacio con realidad aumentada.",
};

type Model = {
  file: string;
  fam: string;
  name: string;
  status: "listo" | "revision";
};

export default function NorthdecoPage() {
  const models = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/northdeco/manifest.json"),
      "utf8",
    ),
  ) as Model[];

  const listo = models.filter((m) => m.status === "listo").length;

  // Página estática (server component) + JS vanilla en /northdeco/gallery.js.
  // No usa componentes de cliente / hidratación de React: el visor 3D y los
  // filtros los mueve un script propio, así que funciona de forma independiente.
  return (
    <div className="nx">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="nx-head">
        <div className="nx-eyebrow">NAVYX · Digitalización 3D</div>
        <h1>Catálogo 3D de Northdeco</h1>
        <p className="nx-sub">
          Gira cada mueble 360° arrastrando con el ratón o el dedo. En el móvil,
          toca <b>Ver en tu espacio</b> para colocarlo en tu salón con realidad
          aumentada.
        </p>
        <div className="nx-toolbar">
          <div className="nx-filters" aria-label="Filtrar modelos">
            <button className="on" data-filter="todos" type="button">
              Todos <span>{models.length}</span>
            </button>
            <button data-filter="listo" type="button">
              Listos <span>{listo}</span>
            </button>
            <button data-filter="revision" type="button">
              Cristal en revisión <span>{models.length - listo}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="nx-grid">
        {models.map((m) => (
          <figure
            className="nx-card"
            key={m.file}
            data-status={m.status}
            data-file={m.file}
            data-src={`/northdeco/models/${m.file}`}
            data-alt={`${m.fam} ${m.name}`}
          >
            <div className="nx-viewer">
              <div className="nx-ph" aria-hidden="true" />
              <span className={`nx-chip ${m.status}`}>
                {m.status === "listo" ? "Listo" : "En revisión"}
              </span>
            </div>
            <figcaption>
              <div className="nx-cap">
                <span className="nx-fam">{m.fam}</span>
                <span className="nx-name">{m.name}</span>
              </div>
              <div className="nx-review">
                <label className="nx-check">
                  <input type="checkbox" className="nx-check-input" />
                  <span className="nx-box" aria-hidden="true" />
                  <span className="nx-check-lbl">Visto bueno</span>
                </label>
                <button type="button" className="nx-cmt-btn">
                  <span aria-hidden="true">💬</span> Comentar
                  <span className="nx-cmt-n" hidden />
                </button>
              </div>
              <ul className="nx-comments" />
              <div className="nx-cmt-form" hidden>
                <input
                  className="nx-cmt-name"
                  type="text"
                  placeholder="Tu nombre (opcional)"
                  maxLength={80}
                />
                <textarea
                  className="nx-cmt-text"
                  placeholder="¿Está bien? ¿Falta algo?"
                  rows={2}
                  maxLength={2000}
                />
                <div className="nx-cmt-row">
                  <button type="button" className="nx-cmt-cancel">
                    Cancelar
                  </button>
                  <button type="button" className="nx-cmt-send">
                    Enviar
                  </button>
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <footer className="nx-foot">
        <span>
          Preparado por <b className="nx-mark">NAVYX</b> — Digitalización 3D &amp;
          AR para e-commerce
        </span>
        <span>Julio 2026</span>
      </footer>

      <script src="/northdeco/gallery.js?v=2" defer />
    </div>
  );
}

const CSS = `
.nx{
  --paper:#FAF9F6; --raise:#FFFFFF; --ink:#201D19; --muted:#6C665C; --faint:#938B7F;
  --line:#E7E2D9; --brand:#1F5450; --brand-ink:#1F5450;
  --ready:#5E863A; --ready-bg:#EEF2E6; --review:#B57F22; --review-bg:#F6EEDD;
  --shadow:0 1px 2px rgba(30,25,18,.04), 0 10px 26px rgba(30,25,18,.06);
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:var(--sans); -webkit-font-smoothing:antialiased;
  padding:clamp(24px,5vw,56px) clamp(16px,4vw,44px) 40px;
}
@media (prefers-color-scheme:dark){
  .nx{
    --paper:#141310; --raise:#1D1B16; --ink:#EFEBE2; --muted:#A69E90; --faint:#7E766A;
    --line:#302C24; --brand:#67B5AD; --brand-ink:#7CC3BB;
    --ready:#8FB35F; --ready-bg:#1E2417; --review:#D3A24A; --review-bg:#241E12;
    --shadow:0 1px 2px rgba(0,0,0,.3), 0 12px 30px rgba(0,0,0,.4);
  }
}
.nx *{box-sizing:border-box}
.nx-head{max-width:900px;margin:0 auto 26px}
.nx-eyebrow{font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;
  color:var(--brand-ink);display:flex;align-items:center;gap:10px}
.nx-eyebrow::before{content:"";width:26px;height:1.5px;background:var(--brand)}
.nx h1{font-size:clamp(26px,5vw,40px);line-height:1.08;letter-spacing:-.02em;font-weight:680;
  margin:16px 0 0;text-wrap:balance}
.nx-sub{color:var(--muted);font-size:15px;line-height:1.6;margin:12px 0 0;max-width:60ch}
.nx-sub b{color:var(--ink);font-weight:600}
.nx-toolbar{margin-top:22px}
.nx-filters{display:inline-flex;flex-wrap:wrap;gap:6px;background:var(--raise);
  border:1px solid var(--line);border-radius:100px;padding:5px}
.nx-filters button{font-family:inherit;font-size:13.5px;font-weight:560;color:var(--muted);
  background:transparent;border:0;border-radius:100px;padding:8px 15px;cursor:pointer;
  display:inline-flex;align-items:center;gap:8px;transition:background .15s,color .15s}
.nx-filters button span{font-size:12px;font-weight:700;color:var(--faint);
  font-variant-numeric:tabular-nums}
.nx-filters button:hover{color:var(--ink)}
.nx-filters button.on{background:var(--brand);color:#fff}
.nx-filters button.on span{color:rgba(255,255,255,.75)}
.nx-filters button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.nx-grid{max-width:1200px;margin:0 auto;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.nx-card{margin:0;background:var(--raise);border:1px solid var(--line);border-radius:14px;
  overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column}
.nx-viewer{position:relative;aspect-ratio:1/1;background:
  radial-gradient(120% 100% at 50% 0%, rgba(31,84,80,.05), transparent 70%)}
.nx-viewer model-viewer{position:absolute;inset:0;width:100%;height:100%}
.nx-ph{position:absolute;inset:0}
.nx-ph::after{content:"";position:absolute;inset:0;margin:auto;width:22px;height:22px;
  border-radius:50%;border:2px solid var(--line);border-top-color:var(--brand);
  animation:nx-spin 1s linear infinite}
@keyframes nx-spin{to{transform:rotate(360deg)}}
.nx-chip{position:absolute;top:10px;left:10px;font-size:10.5px;font-weight:650;
  letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:100px;
  backdrop-filter:blur(4px);z-index:2}
.nx-chip.listo{background:var(--ready-bg);color:var(--ready)}
.nx-chip.revision{background:var(--review-bg);color:var(--review)}
.nx-card figcaption{padding:12px 15px 14px;border-top:1px solid var(--line);
  display:flex;flex-direction:column;gap:10px}
.nx-cap{display:flex;flex-direction:column;gap:2px}
.nx-fam{font-size:14px;font-weight:660;letter-spacing:-.01em}
.nx-name{font-size:12.5px;color:var(--faint)}
/* Barra de revisión */
.nx-review{display:flex;align-items:center;justify-content:space-between;gap:8px}
.nx-check{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.nx-check-input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.nx-box{width:18px;height:18px;border:1.5px solid var(--line);border-radius:5px;
  display:grid;place-items:center;transition:background .12s,border-color .12s;flex:none}
.nx-check-input:checked + .nx-box{background:var(--ready);border-color:var(--ready)}
.nx-check-input:checked + .nx-box::after{content:"✓";color:#fff;font-size:12px;font-weight:700;line-height:1}
.nx-check-input:focus-visible + .nx-box{outline:2px solid var(--brand);outline-offset:2px}
.nx-check-lbl{font-size:13px;color:var(--muted)}
.nx-check-input:checked ~ .nx-check-lbl{color:var(--ready);font-weight:600}
.nx-cmt-btn{font-family:inherit;font-size:12.5px;color:var(--muted);background:transparent;
  border:1px solid var(--line);border-radius:100px;padding:5px 11px;cursor:pointer;
  display:inline-flex;align-items:center;gap:5px;transition:color .12s,border-color .12s}
.nx-cmt-btn:hover{color:var(--ink);border-color:var(--faint)}
.nx-cmt-n{background:var(--brand);color:#fff;font-size:10.5px;font-weight:700;min-width:16px;
  height:16px;border-radius:100px;display:inline-grid;place-items:center;padding:0 4px}
.nx-comments{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.nx-comments:empty{display:none}
.nx-cmt-item{position:relative;background:var(--paper);border:1px solid var(--line);
  border-radius:9px;padding:7px 26px 7px 10px;font-size:12.5px;line-height:1.45}
.nx-cmt-del{position:absolute;top:4px;right:5px;width:19px;height:19px;border:0;padding:0;
  background:transparent;color:var(--faint);font-size:16px;line-height:1;cursor:pointer;
  border-radius:5px;display:grid;place-items:center;transition:color .12s,background .12s}
.nx-cmt-del:hover{color:#d9534f;background:rgba(217,83,79,.13)}
.nx-cmt-del:disabled{opacity:.4;cursor:default}
.nx-cmt-author{font-weight:660;color:var(--ink);margin-right:6px}
.nx-cmt-body{color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}
.nx-cmt-form{display:flex;flex-direction:column;gap:6px}
.nx-cmt-form input,.nx-cmt-form textarea{width:100%;font-family:inherit;font-size:12.5px;
  color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:8px;
  padding:7px 9px;box-sizing:border-box}
.nx-cmt-form textarea{resize:vertical;min-height:44px}
.nx-cmt-form input:focus,.nx-cmt-form textarea:focus{outline:none;border-color:var(--brand)}
.nx-cmt-row{display:flex;justify-content:flex-end;gap:6px}
.nx-cmt-cancel{background:transparent;border:0;color:var(--muted);font-size:12.5px;cursor:pointer;padding:6px 8px}
.nx-cmt-send{background:var(--brand);color:#fff;border:0;border-radius:8px;padding:6px 14px;
  font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.nx-cmt-send:disabled{opacity:.5;cursor:default}
.nx-foot{max-width:1200px;margin:40px auto 0;padding-top:20px;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;
  font-size:12.5px;color:var(--faint)}
.nx-mark{color:var(--brand-ink);font-weight:800;letter-spacing:.02em}
@media (prefers-reduced-motion:reduce){.nx *{transition:none!important}.nx-ph::after{animation:none}}
`;
