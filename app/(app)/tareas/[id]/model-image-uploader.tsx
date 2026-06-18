"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ModelImageUploader({
  taskId,
  phase,
  only,
}: {
  taskId: string;
  phase: string;
  only?: "reference" | "progress";
}) {
  const progInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function uploadAll(files: FileList, kind: string) {
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("taskId", taskId);
        fd.append("phase", phase);
        fd.append("kind", kind);
        const res = await fetch("/api/model-image", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Error al subir la imagen.");
          break;
        }
      }
      router.refresh();
    } catch {
      setError("Error de red al subir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={progInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadAll(e.target.files, "progress");
          e.target.value = "";
        }}
      />
      <input
        ref={refInput}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) uploadAll(e.target.files, "reference");
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        {only !== "reference" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => progInput.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Subir avance
          </Button>
        )}
        {only !== "progress" && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => refInput.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            Subir referencia
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
