"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Cargamos Google <model-viewer> desde el CDN oficial una sola vez.
// (No hay CSP que lo bloquee; mismo enfoque que navyx-saas.)
const MV_SRC =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

let mvPromise: Promise<void> | null = null;
function loadModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (mvPromise) return mvPromise;
  mvPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = MV_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar el visor 3D."));
    document.head.appendChild(s);
  });
  return mvPromise;
}

export function ModelViewer({
  src,
  alt = "Modelo 3D",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    loadModelViewer()
      .then(() => customElements.whenDefined("model-viewer"))
      .then(() => {
        if (mounted) setReady(true);
      })
      .catch((e: unknown) => {
        if (mounted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const wrap = cn(
    "flex h-full w-full items-center justify-center rounded-xl bg-gradient-to-b from-muted/40 to-muted/10",
    className,
  );

  if (error) {
    return (
      <div className={cn(wrap, "text-sm text-muted-foreground")}>{error}</div>
    );
  }
  if (!ready) {
    return (
      <div className={cn(wrap, "text-sm text-muted-foreground")}>
        <span className="animate-pulse">Cargando visor 3D…</span>
      </div>
    );
  }

  // Custom element: usamos createElement para evitar fricción de tipos JSX.
  return React.createElement("model-viewer", {
    src,
    alt,
    "camera-controls": "",
    "auto-rotate": "",
    "auto-rotate-delay": "0",
    "interaction-prompt": "none",
    "shadow-intensity": "0.6",
    "shadow-softness": "0.9",
    exposure: "1.05",
    "tone-mapping": "neutral",
    "environment-image": "neutral",
    "camera-orbit": "-25deg 72deg 105%",
    loading: "eager",
    reveal: "auto",
    className: cn(
      "h-full w-full rounded-xl [--poster-color:transparent]",
      className,
    ),
    style: { width: "100%", height: "100%", backgroundColor: "transparent" },
  });
}
