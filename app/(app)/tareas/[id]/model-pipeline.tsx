import { CheckSquare, Square, TriangleAlert, Trash2, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModelPhase } from "@/generated/prisma/enums";
import { toggleMesh, toggleTexture, toggleClient, requestChanges, deleteModelImage } from "./model-actions";
import { ModelImageUploader } from "./model-image-uploader";

type Img = { id: string; phase: ModelPhase; kind: string; canDelete: boolean };

export function ModelPipeline({
  taskId,
  phase,
  changesRequested,
  meshApprovedAt,
  textureApprovedAt,
  clientApprovedAt,
  referenceUrl,
  images,
  isAdmin,
}: {
  taskId: string;
  phase: ModelPhase;
  changesRequested: boolean;
  meshApprovedAt: Date | null;
  textureApprovedAt: Date | null;
  clientApprovedAt: Date | null;
  referenceUrl: string | null;
  images: Img[];
  isAdmin: boolean;
}) {
  const refs = images.filter((i) => i.kind === "reference");
  const progress = images.filter((i) => i.kind !== "reference");

  const banner = changesRequested
    ? { cls: "border-amber-300 bg-amber-50 text-amber-900", text: "⚠ Cambios pedidos: lee el comentario, corrige y sube un avance nuevo." }
    : phase === "MESH"
      ? { cls: "border-indigo-300 bg-indigo-50 text-indigo-900", text: "Paso 1 · MALLA — modela la pieza y sube tus avances. Cuando esté lista, Lorenzo la valida y pasa a Textura." }
      : phase === "TEXTURE"
        ? { cls: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900", text: "Paso 2 · TEXTURA — aplica la textura y sube avances. Al validarla, la pieza queda terminada." }
        : {
            cls: "border-green-300 bg-green-50 text-green-900",
            text: clientApprovedAt
              ? "✓ Pieza terminada y validada por el cliente."
              : "✓ Pieza terminada. Falta el visto bueno del cliente.",
          };

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        {/* Qué toca hacer ahora */}
        <div className={cn("rounded-lg border px-3 py-2 text-sm font-semibold", banner.cls)}>
          {banner.text}
        </div>

        {/* Casillas de validación */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" /> Validación
          </span>
          <Casilla checked={!!meshApprovedAt} label="Malla" taskId={taskId} action={isAdmin ? toggleMesh : undefined} />
          <Casilla
            checked={!!textureApprovedAt}
            label="Textura"
            taskId={taskId}
            disabled={!meshApprovedAt}
            action={isAdmin ? toggleTexture : undefined}
          />
          <Casilla
            checked={!!clientApprovedAt}
            label="Cliente"
            taskId={taskId}
            disabled={!textureApprovedAt}
            action={isAdmin ? toggleClient : undefined}
          />
          {changesRequested && (
            <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              <TriangleAlert className="size-3.5" /> Cambios pedidos
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Referencia (objeto real) */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Referencia (objeto real)
              </span>
              <ModelImageUploader taskId={taskId} phase={phase} only="reference" />
            </div>
            {referenceUrl && (
              <a
                href={referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 truncate text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5 shrink-0" />
                <span className="truncate">{referenceUrl.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
            <Gallery images={refs} empty="Sin foto de referencia" />
          </section>

          {/* Avances */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Avances ({progress.length})
              </span>
              <ModelImageUploader taskId={taskId} phase={phase} only="progress" />
            </div>
            <Gallery images={progress} empty="Sin avances todavía" />
          </section>
        </div>

        {/* Pedir cambios (admin) */}
        {isAdmin && (
          <form action={requestChanges} className="flex items-center gap-2 border-t border-border pt-3">
            <Input name="note" placeholder="Pedir cambios: qué corregir…" className="h-8 flex-1 text-sm" />
            <input type="hidden" name="taskId" value={taskId} />
            <Button type="submit" variant="outline" size="sm">
              <TriangleAlert className="size-3.5" /> Pedir cambios
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Casilla({
  checked,
  label,
  taskId,
  disabled,
  action,
}: {
  checked: boolean;
  label: string;
  taskId: string;
  disabled?: boolean;
  action?: (formData: FormData) => void | Promise<void>;
}) {
  const inner = (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium",
        checked
          ? "border-green-300 bg-green-50 text-green-800"
          : disabled
            ? "border-border bg-muted/40 text-muted-foreground/50"
            : "border-border text-foreground",
      )}
    >
      {checked ? <CheckSquare className="size-4" /> : <Square className="size-4" />} {label}
    </span>
  );
  if (!action || disabled) return inner;
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <button type="submit" className="transition hover:opacity-75" title={checked ? "Quitar validación" : "Validar"}>
        {inner}
      </button>
    </form>
  );
}

function Gallery({ images, empty }: { images: Img[]; empty: string }) {
  if (images.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {images.map((img) => (
        <div key={img.id} className="group relative overflow-hidden rounded-md border border-border">
          <a href={`/api/model-image/${img.id}`} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/model-image/${img.id}`}
              alt="imagen"
              className="aspect-square w-full bg-muted object-cover"
            />
          </a>
          {img.canDelete && (
            <form action={deleteModelImage} className="absolute right-0.5 top-0.5">
              <input type="hidden" name="id" value={img.id} />
              <button
                className="rounded bg-black/50 p-0.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                title="Eliminar"
              >
                <Trash2 className="size-3" />
              </button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
