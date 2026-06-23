import {
  Boxes,
  Palette,
  BadgeCheck,
  Check,
  Lock,
  TriangleAlert,
  Trash2,
  ImageOff,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ModelPhase } from "@/generated/prisma/enums";
import { toggleMesh, toggleTexture, toggleClient, requestChanges, deleteModelImage } from "./model-actions";
import { ModelImageUploader } from "./model-image-uploader";

type Img = { id: string; phase: ModelPhase; kind: string; canDelete: boolean };
type Action = (formData: FormData) => void | Promise<void>;

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
  const steps: {
    label: string;
    icon: LucideIcon;
    done: boolean;
    active: boolean;
    locked: boolean;
    action: Action;
  }[] = [
    { label: "Malla", icon: Boxes, done: !!meshApprovedAt, active: phase === "MESH", locked: false, action: toggleMesh },
    { label: "Textura", icon: Palette, done: !!textureApprovedAt, active: phase === "TEXTURE", locked: !meshApprovedAt, action: toggleTexture },
    { label: "Cliente", icon: BadgeCheck, done: !!clientApprovedAt, active: phase === "DONE" && !clientApprovedAt, locked: !textureApprovedAt, action: toggleClient },
  ];

  const banner = changesRequested
    ? { dot: "bg-amber-500", text: "Cambios pedidos — corrige y sube un avance nuevo." }
    : phase === "MESH"
      ? { dot: "bg-indigo-500", text: "Ahora toca la MALLA. Modela y sube tus avances." }
      : phase === "TEXTURE"
        ? { dot: "bg-fuchsia-500", text: "Ahora toca la TEXTURA. Aplícala y sube avances." }
        : clientApprovedAt
          ? { dot: "bg-green-500", text: "Pieza terminada y validada por el cliente. 🎉" }
          : { dot: "bg-green-500", text: "Pieza terminada. A la espera del visto bueno del cliente." };

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5 py-5">
        {/* Stepper de progreso */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {steps.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-2">
              <Step step={s} taskId={taskId} isAdmin={isAdmin} />
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "hidden h-1 flex-1 rounded-full sm:block",
                    s.done ? "bg-green-400" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Qué toca ahora */}
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm font-medium">
          <span className={cn("size-2 shrink-0 animate-pulse rounded-full", banner.dot)} />
          {banner.text}
        </div>

        {/* Avances */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Avances del modelo ({images.length})</h3>
            <ModelImageUploader taskId={taskId} phase={phase} only="progress" />
          </div>
          {images.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-muted/20 py-10 text-center text-sm text-muted-foreground">
              <ImageOff className="size-6" />
              Sube capturas de cómo va el 3D para que se valide.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                  <a href={`/api/model-image/${img.id}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/model-image/${img.id}`}
                      alt="avance"
                      className="size-full bg-muted object-cover transition group-hover:scale-105"
                    />
                  </a>
                  {img.canDelete && (
                    <form action={deleteModelImage} className="absolute right-1 top-1">
                      <input type="hidden" name="id" value={img.id} />
                      <button
                        className="rounded-md bg-black/50 p-1 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                        title="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pedir cambios (admin) */}
        {isAdmin && (
          <form action={requestChanges} className="flex items-center gap-2 border-t border-border pt-4">
            <Input name="note" placeholder="Pedir cambios: ¿qué hay que corregir?" className="h-9 flex-1 text-sm" />
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

function Step({
  step,
  taskId,
  isAdmin,
}: {
  step: { label: string; icon: LucideIcon; done: boolean; active: boolean; locked: boolean; action: Action };
  taskId: string;
  isAdmin: boolean;
}) {
  const { label, icon: Icon, done, active, locked } = step;
  const clickable = isAdmin && !locked;

  const card = (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
        done
          ? "border-green-300 bg-green-50"
          : active
            ? "border-primary/40 bg-primary/5 ring-2 ring-primary/15"
            : locked
              ? "border-border bg-muted/30 opacity-60"
              : "border-border bg-card",
        clickable && "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          done ? "bg-green-500 text-white" : active ? "bg-primary text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-5" strokeWidth={3} /> : locked ? <Lock className="size-4" /> : <Icon className="size-5" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div
          className={cn(
            "text-xs",
            done ? "text-green-700" : active ? "text-primary" : "text-muted-foreground",
          )}
        >
          {done ? "Validada ✓" : locked ? "Bloqueada" : active ? "En curso" : "Pendiente"}
        </div>
      </div>
    </div>
  );

  if (!clickable) return card;
  return (
    <form action={step.action} className="flex-1">
      <input type="hidden" name="taskId" value={taskId} />
      <button type="submit" className="w-full cursor-pointer" title={done ? "Quitar validación" : "Validar"}>
        {card}
      </button>
    </form>
  );
}
