"use client";

import * as React from "react";
import { Box, MessageSquareWarning, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModelViewer } from "@/components/model-viewer";
import { cn } from "@/lib/utils";
import { clientRequestChanges } from "../actions";

/** Galería de fotos reales del producto (Shopify no permite iframe → imágenes). */
function PhotoPanel({ taskId, webUrl }: { taskId: string; webUrl?: string | null }) {
  const [images, setImages] = React.useState<string[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/piece-photos/${taskId}`)
      .then((r) => r.json())
      .then((d: { images?: string[] }) => {
        if (alive) setImages(d.images ?? []);
      })
      .catch(() => alive && setImages([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [taskId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fotos reales
        </span>
        {webUrl && (
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3" /> Abrir web
          </a>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
        {loading && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Cargando fotos…
          </div>
        )}
        {!loading && images && images.length === 0 && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No hay fotos disponibles
            {webUrl ? " (abre la web para verlas)" : ""}.
          </div>
        )}
        {images?.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`Foto ${i + 1}`}
            loading="lazy"
            className="w-full rounded-lg border border-border bg-white object-contain"
          />
        ))}
      </div>
    </div>
  );
}

export function PieceActions({
  taskId,
  title,
  hasModel,
  changesRequested,
  webUrl,
}: {
  taskId: string;
  title: string;
  hasModel: boolean;
  changesRequested: boolean;
  webUrl?: string | null;
}) {
  const [view, setView] = React.useState(false);
  const [changes, setChanges] = React.useState(false);
  const [pending, start] = React.useTransition();

  function submitChanges(formData: FormData) {
    start(async () => {
      await clientRequestChanges(formData);
      setChanges(false);
    });
  }

  return (
    <div className="flex items-center justify-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant={hasModel ? "outline" : "ghost"}
        disabled={!hasModel}
        title={hasModel ? "Ver el modelo 3D" : "Todavía no hay modelo 3D"}
        onClick={() => setView(true)}
      >
        <Box className="size-4" /> Ver 3D
      </Button>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        title="Reportar un error o pedir un cambio en esta pieza"
        onClick={() => setChanges(true)}
        className={cn(changesRequested && "text-amber-600 hover:text-amber-700")}
      >
        <MessageSquareWarning className="size-4" />
        {changesRequested ? "Cambios pedidos" : "Solicitar cambios"}
      </Button>

      {/* Visor 3D + fotos reales, lado a lado */}
      <Modal
        open={view}
        onClose={() => setView(false)}
        title={title}
        className="max-w-6xl"
      >
        <div className="flex h-[68vh] w-full flex-col gap-3 md:flex-row">
          {/* 3D */}
          <div className="min-h-0 flex-[3] overflow-hidden rounded-xl border border-border bg-card">
            {view && hasModel && (
              <ModelViewer src={`/api/model/${taskId}`} alt={title} />
            )}
          </div>
          {/* Fotos reales para comparar */}
          <div className="min-h-0 flex-[2] md:max-w-sm">
            {view && <PhotoPanel taskId={taskId} webUrl={webUrl} />}
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Gira el 3D y compáralo con las fotos reales de la ficha. El modelo se
          carga desde nuestro servidor, no necesitas acceso a Drive.
        </p>
      </Modal>

      {/* Solicitar cambios / reportar error */}
      <Modal
        open={changes}
        onClose={() => setChanges(false)}
        title={`Solicitar cambios · ${title}`}
      >
        <form action={submitChanges} className="space-y-3">
          <input type="hidden" name="taskId" value={taskId} />
          <label className="block text-sm text-muted-foreground">
            Cuéntanos qué hay que corregir en esta pieza (proporciones, color,
            algún detalle…). El equipo lo verá en la tarea.
          </label>
          <Textarea
            name="body"
            required
            rows={4}
            placeholder="Ej.: la pata trasera es demasiado gruesa comparada con la foto."
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setChanges(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
