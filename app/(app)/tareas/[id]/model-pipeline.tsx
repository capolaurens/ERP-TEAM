import {
  Check,
  TriangleAlert,
  RotateCcw,
  ImageOff,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ModelPhase } from "@/generated/prisma/enums";
import {
  approveMesh,
  approveTexture,
  markClientOK,
  requestChanges,
  revertPhase,
  deleteModelImage,
} from "./model-actions";
import { ModelImageUploader } from "./model-image-uploader";

type Img = { id: string; phase: ModelPhase; kind: string; canDelete: boolean };

export function ModelPipeline({
  taskId,
  phase,
  changesRequested,
  meshApprovedAt,
  textureApprovedAt,
  clientApprovedAt,
  images,
  isAdmin,
}: {
  taskId: string;
  phase: ModelPhase;
  changesRequested: boolean;
  meshApprovedAt: Date | null;
  textureApprovedAt: Date | null;
  clientApprovedAt: Date | null;
  images: Img[];
  isAdmin: boolean;
}) {
  const steps: { key: ModelPhase; label: string }[] = [
    { key: "MESH", label: "Malla" },
    { key: "TEXTURE", label: "Textura" },
    { key: "DONE", label: "Completada" },
  ];
  const stepState = (key: ModelPhase): "done" | "active" | "pending" => {
    if (key === "MESH") return meshApprovedAt ? "done" : phase === "MESH" ? "active" : "pending";
    if (key === "TEXTURE") return textureApprovedAt ? "done" : phase === "TEXTURE" ? "active" : "pending";
    return phase === "DONE" ? "done" : "pending";
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" /> Validación 3D
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stepper */}
        <div className="flex items-center">
          {steps.map((s, i) => {
            const st = stepState(s.key);
            return (
              <div key={s.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold",
                      st === "done" && "border-green-500 bg-green-500 text-white",
                      st === "active" && "border-primary bg-primary/10 text-primary",
                      st === "pending" && "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {st === "done" ? <Check className="size-5" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      st === "pending" ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      "mx-1 mb-5 h-0.5 flex-1",
                      stepState(steps[i + 1].key) !== "pending" || st === "done"
                        ? "bg-green-400"
                        : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Aviso de cambios solicitados */}
        {changesRequested && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Se han pedido cambios en esta fase. Revisa los comentarios, corrige
              y vuelve a subir avances.
            </span>
          </div>
        )}

        {/* Estado de las aprobaciones */}
        <div className="grid gap-2 sm:grid-cols-3">
          <Approval label="Malla" at={meshApprovedAt} />
          <Approval label="Textura" at={textureApprovedAt} />
          <Approval label="Cliente" at={clientApprovedAt} />
        </div>

        {/* Galería de imágenes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">
              Fotos y referencias ({images.length})
            </span>
            {phase !== "DONE" && (
              <ModelImageUploader taskId={taskId} phase={phase} />
            )}
          </div>
          {images.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground">
              <ImageOff className="size-6" />
              Aún no hay imágenes. Sube avances y referencias de cómo va.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {images.map((img) => (
                <div key={img.id} className="group relative overflow-hidden rounded-lg border border-border">
                  <a href={`/api/model-image/${img.id}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/model-image/${img.id}`}
                      alt="Imagen del modelo"
                      className="aspect-square w-full bg-muted object-cover"
                    />
                  </a>
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {img.phase === "MESH" ? "Malla" : img.phase === "TEXTURE" ? "Textura" : "Final"}
                    {" · "}
                    {img.kind === "reference" ? "Ref" : "Avance"}
                  </span>
                  {img.canDelete && (
                    <form action={deleteModelImage} className="absolute right-1 top-1">
                      <input type="hidden" name="id" value={img.id} />
                      <button
                        className="rounded bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                        title="Eliminar imagen"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Acciones de validación (solo admin) */}
        {isAdmin ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            {phase === "MESH" && (
              <form action={approveMesh}>
                <input type="hidden" name="taskId" value={taskId} />
                <Button type="submit" className="w-full sm:w-auto">
                  <Check className="size-4" /> Validar malla → pasar a textura
                </Button>
              </form>
            )}
            {phase === "TEXTURE" && (
              <form action={approveTexture}>
                <input type="hidden" name="taskId" value={taskId} />
                <Button type="submit" className="w-full sm:w-auto">
                  <Check className="size-4" /> Validar textura → pieza completada
                </Button>
              </form>
            )}
            {phase === "DONE" && (
              clientApprovedAt ? (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <ShieldCheck className="size-4" /> Pieza validada por ti y por el
                  cliente.
                </p>
              ) : (
                <form action={markClientOK} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="taskId" value={taskId} />
                  <span className="text-sm text-muted-foreground">
                    Pieza terminada. Cuando el cliente dé el visto bueno:
                  </span>
                  <Button type="submit" variant="default" size="sm">
                    <ShieldCheck className="size-4" /> Cliente validó
                  </Button>
                </form>
              )
            )}

            {phase !== "DONE" && (
              <form action={requestChanges} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="taskId" value={taskId} />
                <div className="min-w-40 flex-1 space-y-1">
                  <span className="text-xs text-muted-foreground">Pedir cambios (nota)</span>
                  <Input name="note" placeholder="Qué hay que corregir…" className="h-9" />
                </div>
                <Button type="submit" variant="outline" size="sm">
                  <TriangleAlert className="size-4" /> Pedir cambios
                </Button>
              </form>
            )}

            {(meshApprovedAt || textureApprovedAt || clientApprovedAt) && (
              <form action={revertPhase}>
                <input type="hidden" name="taskId" value={taskId} />
                <button className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
                  <RotateCcw className="size-3.5" /> Deshacer última validación
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {phase === "DONE"
              ? "Pieza terminada. Pendiente del visto bueno final."
              : "Sube tus avances aquí. Lorenzo validará esta fase para pasar a la siguiente."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Approval({ label, at }: { label: string; at: Date | null }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        at ? "border-green-300 bg-green-50 text-green-800" : "border-border text-muted-foreground",
      )}
    >
      {at ? <Check className="size-4 shrink-0" /> : <span className="size-2 rounded-full bg-border" />}
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="truncate text-xs">{at ? `Validada · ${formatRelative(at)}` : "Pendiente"}</div>
      </div>
    </div>
  );
}
