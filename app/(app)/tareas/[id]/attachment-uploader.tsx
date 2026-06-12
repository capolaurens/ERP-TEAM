"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AttachmentUploader({
  taskId,
  configured,
}: {
  taskId: string;
  configured: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("taskId", taskId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Error al subir el archivo.");
      else router.refresh();
    } catch {
      setError("Error de red al subir el archivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!configured) {
    return (
      <p className="text-sm text-muted-foreground">
        La subida a Google Drive aún no está configurada. Un administrador debe
        conectarla en <strong>Ajustes</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" className="hidden" onChange={onChange} />
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip />}
        {busy ? "Subiendo…" : "Subir archivo"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
