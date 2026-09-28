import Script from "next/script";
import { leerGaleria, normalizarClave } from "@/lib/northdeco-catalogo";
import { POR_REHACER, revisionPorFile } from "@/lib/northdeco-estado";
import { nombreGenerico, unaPorFamilia } from "@/lib/northdeco-muebles";

export const metadata = {
  title: "Mobiliario en 3D",
  robots: { index: false, follow: false },
  description:
    "Muestrario de mobiliario digitalizado en 3D: un modelo de cada familia, con la foto de referencia al lado.",
};

const MATERIAL_LABELS: Record<string, string> = {
  madera: "Madera",
  metal: "Metal",
  tela: "Tela",
  plastico: "Plástico",
  cristal: "Cristal",
  piel: "Piel",
  ratan: "Ratán",
  marmol: "Mármol y piedra",
  ceramica: "Cerámica",
};

function photoUrl(src: string): string {
  return src + (src.includes("?") ? "&" : "?") + "width=900";
}

export const dynamic = "force-dynamic";

/**
 * /muebles: muestrario SIN MARCA para enseñar en ferias qué tipos de mueble y
 * de texturizado sabemos hacer. Misma tarjeta que la galería (visor 3D y foto
 * de referencia al lado) pero: una sola pieza por familia, sin códigos ni
 * nombres comerciales, sin enlace a la tienda y sin controles de revisión.
 * Comparte el proxy del GLB con la galería; el JS es una copia recortada.
 */
export default async function MueblesPage() {
  const galeria = await leerGaleria();
  const revision = await revisionPorFile();
  const models = unaPorFamilia(galeria, revision, (file) => POR_REHACER.has(normalizarClave(file)));

  const matCounts = new Map<string, number>();
  for (const m of models) {
    if (m.material) matCounts.set(m.material, (matCounts.get(m.material) ?? 0) + 1);
  }
  const materials = [...matCounts.entries()]
    .filter(([mat]) => MATERIAL_LABELS[mat])
    .sort((a, b) => b[1] - a[1]);

  const materialesDe = (m: { materials: string[]; material: string | null }) => {
    const claves = m.materials.length ? m.materials : m.material ? [m.material] : [];
    return claves.map((k) => MATERIAL_LABELS[k]).filter(Boolean).join(" · ");
  };

  return (
    <div className="nx">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="nx-head">
        <div className="nx-eyebrow">Digitalización 3D de mobiliario</div>
        <h1>Un mueble de cada familia, en 3D</h1>
        <p className="nx-sub">
          Modelos listos para la web y para realidad aumentada, generados a partir
          de las fotos del producto. Gira cada pieza arrastrando; en el móvil, el
          botón de realidad aumentada la coloca en tu espacio a tamaño real.
        </p>
        <div className="nx-toolbar">
          <div className="nx-filters nx-mats" aria-label="Filtrar por material">
            <button className="on" data-mat="todos" type="button">
              Todos <span>{models.length}</span>
            </button>
            {materials.map(([mat, n]) => (
              <button key={mat} data-mat={mat} type="button">
                {MATERIAL_LABELS[mat]} <span>{n}</span>
              </button>
            ))}
          </div>
          <div className="nx-pager" data-pager>
            <button type="button" className="nx-page-btn" data-page-prev aria-label="Página anterior">
              ‹
            </button>
            <span className="nx-page-lbl" data-page-label>
              …
            </span>
            <button type="button" className="nx-page-btn" data-page-next aria-label="Página siguiente">
              ›
            </button>
          </div>
        </div>
      </header>

      <div className="nx-grid">
        {models.map((m) => {
          const nombre = nombreGenerico(m.name);
          return (
            <figure
              className="nx-card"
              key={m.file}
              data-material={m.material ?? ""}
              data-file={m.file}
              data-src={`/api/northdeco/model/${encodeURIComponent(m.file)}`}
              data-alt={nombre}
            >
              <div className="nx-media">
                <div className="nx-viewer">
                  <div className="nx-ph" aria-hidden="true" />
                  <span className="nx-tag">3D</span>
                </div>
                <div className="nx-photo">
                  {m.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="nx-photo-img"
                      src={photoUrl(m.img)}
                      alt={`Foto de referencia: ${nombre}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="nx-photo-empty">Sin foto</div>
                  )}
                  <span className="nx-tag">FOTO</span>
                </div>
              </div>
              <figcaption>
                <div className="nx-cap">
                  <span className="nx-fam">
                    {nombre}
                    {m.variant && <span className="nx-variant">{m.variant}</span>}
                  </span>
                  {materialesDe(m) && <span className="nx-name">{materialesDe(m)}</span>}
                </div>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="nx-pager nx-pager-bottom" data-pager>
        <button type="button" className="nx-page-btn" data-page-prev aria-label="Página anterior">
          ‹
        </button>
        <span className="nx-page-lbl" data-page-label>
          …
        </span>
        <button type="button" className="nx-page-btn" data-page-next aria-label="Página siguiente">
          ›
        </button>
      </div>

      <footer className="nx-foot">
        <span>Modelos 3D generados a partir de fotografías del producto</span>
        <span>{models.length} familias</span>
      </footer>

      <Script src="/northdeco/muebles.js?v=1" strategy="afterInteractive" />
    </div>
  );
}

const CSS = `
body{background:#fff}
.nx{
  --paper:#FFFFFF; --raise:#FFFFFF; --ink:#201D19; --muted:#6C665C; --faint:#938B7F;
  --line:#E7E2D9; --brand:#1F5450; --brand-ink:#1F5450;
  --shadow:0 1px 2px rgba(30,25,18,.04), 0 10px 26px rgba(30,25,18,.06);
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:var(--sans); -webkit-font-smoothing:antialiased;
  padding:clamp(24px,5vw,56px) clamp(16px,4vw,44px) 40px;
}
.nx *{box-sizing:border-box}
.nx-head{max-width:1240px;margin:0 auto 26px}
.nx-eyebrow{font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;font-weight:600;
  color:var(--brand-ink);display:flex;align-items:center;gap:10px}
.nx-eyebrow::before{content:"";width:26px;height:1.5px;background:var(--brand)}
.nx h1{font-size:clamp(26px,5vw,40px);line-height:1.08;letter-spacing:-.02em;font-weight:680;
  margin:16px 0 0;text-wrap:balance}
.nx-sub{color:var(--muted);font-size:15px;line-height:1.6;margin:12px 0 0;max-width:60ch}
.nx-toolbar{margin-top:22px}
.nx-filters{display:flex;flex-wrap:nowrap;gap:6px;background:var(--raise);
  border:1px solid var(--line);border-radius:100px;padding:5px;
  width:100%;overflow-x:auto;scrollbar-width:thin}
.nx-filters button{flex:1 1 auto;justify-content:center;white-space:nowrap}
.nx-filters button{font-family:inherit;font-size:13.5px;font-weight:560;color:var(--muted);
  background:transparent;border:0;border-radius:100px;padding:8px 15px;cursor:pointer;
  display:inline-flex;align-items:center;gap:8px;transition:background .15s,color .15s}
.nx-filters button span{font-size:12px;font-weight:700;color:var(--faint);
  font-variant-numeric:tabular-nums}
.nx-filters button:hover{color:var(--ink)}
.nx-filters button.on{background:var(--brand);color:#fff}
.nx-filters button.on span{color:rgba(255,255,255,.75)}
.nx-filters button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.nx-grid{max-width:1240px;margin:0 auto;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,560px),1fr));gap:18px}
.nx-media{display:grid;grid-template-columns:1fr 1fr}
.nx-photo{position:relative;aspect-ratio:1/1;background:#fff;
  border-left:1px solid var(--line);display:grid;place-items:center;overflow:hidden}
.nx-photo-img{max-width:88%;max-height:88%;object-fit:contain}
.nx-photo-empty{font-size:12.5px;color:#9a938a}
.nx-tag{position:absolute;bottom:8px;right:10px;font-size:9.5px;font-weight:750;
  letter-spacing:.09em;padding:2px 8px;border-radius:100px;
  background:rgba(20,18,14,.45);color:#fff;backdrop-filter:blur(3px);z-index:2}
.nx-pager{display:flex;align-items:center;gap:12px;margin-top:16px}
.nx-pager-bottom{max-width:1240px;margin:26px auto 0;justify-content:center}
.nx-page-btn{width:34px;height:34px;border-radius:100px;border:1px solid var(--line);
  background:var(--raise);color:var(--ink);font-size:19px;line-height:1;cursor:pointer;
  display:grid;place-items:center;transition:border-color .12s,color .12s,opacity .12s}
.nx-page-btn:hover:not(:disabled){border-color:var(--brand);color:var(--brand-ink)}
.nx-page-btn:disabled{opacity:.32;cursor:default}
.nx-page-lbl{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:110px;text-align:center}
.nx-card{margin:0;background:var(--raise);border:1px solid var(--line);border-radius:14px;
  overflow:hidden;box-shadow:var(--shadow);display:flex;flex-direction:column}
.nx-viewer{position:relative;aspect-ratio:1/1;background:#fff}
.nx-viewer model-viewer{--poster-color:#fff;background:#fff}
.nx-viewer model-viewer{position:absolute;inset:0;width:100%;height:100%}
.nx-ph{position:absolute;inset:0}
.nx-ph::after{content:"";position:absolute;inset:0;margin:auto;width:22px;height:22px;
  border-radius:50%;border:2px solid var(--line);border-top-color:var(--brand);
  animation:nx-spin 1s linear infinite}
@keyframes nx-spin{to{transform:rotate(360deg)}}
.nx-card figcaption{padding:12px 15px 14px;border-top:1px solid var(--line);
  display:flex;flex-direction:column;gap:10px}
.nx-cap{display:flex;flex-direction:column;gap:3px}
.nx-fam{font-size:14px;font-weight:660;letter-spacing:-.01em;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.nx-variant{font-size:10.5px;font-weight:640;letter-spacing:.03em;text-transform:uppercase;
  color:var(--brand-ink);background:color-mix(in srgb,var(--brand-ink) 12%,transparent);
  padding:2px 8px;border-radius:100px;white-space:nowrap}
.nx-name{font-size:12.5px;color:var(--faint)}
.nx-foot{max-width:1200px;margin:40px auto 0;padding-top:20px;border-top:1px solid var(--line);
  display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;
  font-size:12.5px;color:var(--faint)}
@media (prefers-reduced-motion:reduce){.nx *{transition:none!important}.nx-ph::after{animation:none}}
`;
