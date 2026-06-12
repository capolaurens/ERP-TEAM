"use client";

import { useRef } from "react";
import { addComment } from "../actions";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

export function CommentForm({ taskId }: { taskId: string }) {
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (formData) => {
        await addComment(formData);
        ref.current?.reset();
      }}
      className="space-y-2"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <Textarea name="body" required placeholder="Escribe un comentario…" />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingText="Enviando…">
          Comentar
        </SubmitButton>
      </div>
    </form>
  );
}
