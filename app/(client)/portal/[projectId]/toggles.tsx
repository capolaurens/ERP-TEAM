"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clientToggleMesh,
  clientToggleTexture,
  adminToggleMesh,
  adminToggleTexture,
  adminToggleShow,
} from "../actions";

function fire(action: (fd: FormData) => Promise<void>, taskId: string) {
  const fd = new FormData();
  fd.set("taskId", taskId);
  return action(fd);
}

/** Botón-casilla verde reutilizable (presentacional). */
function CheckBox({
  on,
  onClick,
  disabled,
  title,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-pressed={on}
        className={cn(
          "flex size-5 items-center justify-center rounded border transition active:scale-90",
          on
            ? "border-green-600 bg-green-600 text-white"
            : "border-muted-foreground/50 bg-white hover:border-green-600",
          disabled && "cursor-not-allowed opacity-25 hover:border-muted-foreground/50",
        )}
      >
        {on && <Check className="size-3.5" strokeWidth={3} />}
      </button>
    </div>
  );
}

/**
 * Check que marca EL CLIENTE (malla/textura). Respuesta INSTANTÁNEA: cambia en el
 * acto y la escritura en BD va por detrás (si falla, se revierte). Se bloquea si
 * el equipo aún no ha entregado esa fase.
 */
export function ClientCheck({
  taskId,
  kind,
  initialOn,
  locked,
}: {
  taskId: string;
  kind: "mesh" | "texture";
  initialOn: boolean;
  locked: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();
  const label = kind === "mesh" ? "malla" : "textura";
  const title = locked
    ? `El equipo aún no ha entregado la ${label}`
    : on
      ? `Quitar tu OK a la ${label}`
      : `Aprobar la ${label}`;

  function toggle() {
    if (locked) return;
    const next = !on;
    setOn(next);
    startTransition(async () => {
      try {
        await fire(kind === "mesh" ? clientToggleMesh : clientToggleTexture, taskId);
      } catch {
        setOn(!next);
      }
    });
  }

  return <CheckBox on={on} onClick={toggle} disabled={locked} title={title} />;
}

// ───────────────────────── Columna ESTADO (resumen del admin) ─────────────────

type Tone = "green" | "blue" | "amber";
type Status = { tone: Tone; label: string; detail?: string; title: string };

/**
 * Estado resumido de una pieza a partir de las 4 señales: entrega del equipo
 * (malla/textura) y visto bueno del cliente (malla/textura).
 */
function computeStatus(
  mesh: boolean,
  tex: boolean,
  cliMesh: boolean,
  cliTex: boolean,
): Status {
  // Prioridad: si falta algo NUESTRO, la pelota está en nuestro tejado.
  if (!mesh || !tex) {
    const falta = !mesh && !tex ? "malla y textura" : !mesh ? "malla" : "textura";
    return {
      tone: "amber",
      label: "Falta lo nuestro",
      detail: falta,
      title: `Nos falta entregar: ${falta}`,
    };
  }
  // Entregado todo por nuestra parte → depende del cliente.
  if (cliMesh && cliTex) {
    return {
      tone: "green",
      label: "Completo",
      title: "Entregado por el equipo y aprobado por el cliente",
    };
  }
  if (!cliMesh && !cliTex) {
    return {
      tone: "blue",
      label: "Pendiente cliente",
      detail: "0/2",
      title: "El cliente aún no ha aprobado ni malla ni textura",
    };
  }
  const falta = !cliMesh ? "malla" : "textura";
  return {
    tone: "blue",
    label: "Falta cliente",
    detail: falta,
    title: `El cliente aprobó ${!cliMesh ? "la textura" : "la malla"}; le falta ${falta}`,
  };
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Tone, { cls: string; Icon: typeof CheckCircle2 }> = {
    green: { cls: "border-green-200 bg-green-100 text-green-700", Icon: CheckCircle2 },
    blue: { cls: "border-blue-200 bg-blue-100 text-blue-700", Icon: Clock },
    amber: { cls: "border-amber-200 bg-amber-100 text-amber-800", Icon: AlertTriangle },
  };
  const { cls, Icon } = map[status.tone];
  return (
    <div className="flex justify-center">
      <span
        title={status.title}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium",
          cls,
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        {status.label}
        {status.detail && (
          <span className="font-normal opacity-70">· {status.detail}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Celdas interactivas del ADMIN: Malla, Textura y ESTADO. Los checks de malla y
 * textura marcan la ENTREGA del equipo (instantáneo, desbloquea al cliente). La
 * columna Estado resume de un vistazo si falta algo nuestro, si falta el cliente
 * (y cuál), o si está completo. Reacciona en vivo a los checks de malla/textura.
 */
export function AdminPieceCells({
  taskId,
  meshDelivered,
  textureDelivered,
  clientMesh,
  clientTexture,
}: {
  taskId: string;
  meshDelivered: boolean;
  textureDelivered: boolean;
  clientMesh: boolean;
  clientTexture: boolean;
}) {
  const [mesh, setMesh] = useState(meshDelivered);
  const [tex, setTex] = useState(textureDelivered);
  const [, startTransition] = useTransition();

  function toggleMesh() {
    const next = !mesh;
    setMesh(next);
    startTransition(async () => {
      try {
        await fire(adminToggleMesh, taskId);
      } catch {
        setMesh(!next);
      }
    });
  }
  function toggleTex() {
    const next = !tex;
    setTex(next);
    startTransition(async () => {
      try {
        await fire(adminToggleTexture, taskId);
      } catch {
        setTex(!next);
      }
    });
  }

  const status = computeStatus(mesh, tex, clientMesh, clientTexture);

  return (
    <>
      <td className="border-b border-border bg-green-50/40 px-3 py-2">
        <CheckBox
          on={mesh}
          onClick={toggleMesh}
          title={
            mesh
              ? "Quitar entrega de malla (bloquea al cliente)"
              : "Marcar malla como entregada por el equipo (desbloquea al cliente)"
          }
        />
      </td>
      <td className="border-b border-border bg-green-50/40 px-3 py-2">
        <CheckBox
          on={tex}
          onClick={toggleTex}
          title={
            tex
              ? "Quitar entrega de textura (bloquea al cliente)"
              : "Marcar textura como entregada por el equipo (desbloquea al cliente)"
          }
        />
      </td>
      <td className="border-b border-border px-3 py-2">
        <StatusPill status={status} />
      </td>
    </>
  );
}

/**
 * Toggle SOLO ADMIN "Tu validación": abre/oculta la pieza al cliente. Instantáneo.
 */
export function ShowToggle({
  taskId,
  initialOn,
}: {
  taskId: string;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      try {
        await fire(adminToggleShow, taskId);
      } catch {
        setOn(!next);
      }
    });
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        title={on ? "Ocultar esta pieza al cliente" : "Abrir esta pieza al cliente"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition active:scale-95",
          on
            ? "border-green-600 bg-green-600 text-white"
            : "border-muted-foreground/40 bg-white text-muted-foreground hover:border-green-600",
        )}
      >
        {on ? (
          <>
            <Eye className="size-3.5" /> Visible
          </>
        ) : (
          <>
            <EyeOff className="size-3.5" /> Oculta
          </>
        )}
      </button>
    </div>
  );
}
