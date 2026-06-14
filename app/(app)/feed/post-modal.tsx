"use client";

import { useActionState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { createPost, updatePost, deletePost } from "./actions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FeedPost } from "./feed-grid";

const initial: { error?: string; ok?: string } = {};

export function PostModal({
  open,
  onClose,
  post,
}: {
  open: boolean;
  onClose: () => void;
  post?: FeedPost;
}) {
  const [state, formAction, pending] = useActionState(
    post ? updatePost : createPost,
    initial,
  );

  useEffect(() => {
    if (state?.ok) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={post ? "Editar publicación" : "Nueva publicación"}
    >
      <form action={formAction} className="space-y-4">
        {post && <input type="hidden" name="id" value={post.id} />}
        <div className="space-y-1.5">
          <Label htmlFor="ig-img">URL de la imagen</Label>
          <Input
            id="ig-img"
            name="imageUrl"
            defaultValue={post?.imageUrl ?? ""}
            placeholder="https://…/imagen.jpg"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ig-cap">Texto / caption</Label>
          <Textarea
            id="ig-cap"
            name="caption"
            defaultValue={post?.caption ?? ""}
            placeholder="Copy de la publicación, hashtags…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ig-status">Estado</Label>
            <Select id="ig-status" name="status" defaultValue={post?.status ?? "idea"}>
              <option value="idea">Idea</option>
              <option value="planned">Planificado</option>
              <option value="published">Publicado</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-date">Fecha prevista</Label>
            <Input
              id="ig-date"
              type="date"
              name="scheduledAt"
              defaultValue={post?.scheduledInput ?? ""}
            />
          </div>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : post ? "Guardar" : "Añadir"}
          </Button>
        </div>
      </form>

      {post && (
        <form
          action={deletePost}
          onSubmit={(e) => {
            if (!confirm("¿Eliminar esta publicación del feed?"))
              e.preventDefault();
          }}
          className="mt-3 border-t border-border pt-3"
        >
          <input type="hidden" name="id" value={post.id} />
          <button
            type="submit"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-red-600"
          >
            <Trash2 className="size-4" /> Eliminar publicación
          </button>
        </form>
      )}
    </Modal>
  );
}
