"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, ImageIcon } from "lucide-react";
import { reorderPosts } from "./actions";
import { PostModal } from "./post-modal";
import { cn } from "@/lib/utils";

export type FeedPost = {
  id: string;
  imageUrl: string | null;
  caption: string | null;
  status: string;
  scheduledInput: string;
};

const STATUS: Record<string, { label: string; dot: string }> = {
  idea: { label: "Idea", dot: "bg-slate-400" },
  planned: { label: "Planificado", dot: "bg-amber-400" },
  published: { label: "Publicado", dot: "bg-green-500" },
};

export function FeedGrid({ posts: initial }: { posts: FeedPost[] }) {
  const [posts, setPosts] = useState<FeedPost[]>(initial);
  const [editing, setEditing] = useState<FeedPost | null>(null);
  const [creating, setCreating] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = posts.findIndex((p) => p.id === active.id);
    const newIndex = posts.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(posts, oldIndex, newIndex);
    setPosts(next);
    reorderPosts(next.map((p) => p.id));
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-[#1b1b1b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/favicon.avif" alt="Navyx" className="size-9" />
        </div>
        <div>
          <div className="font-semibold">@navyx</div>
          <div className="text-sm text-muted-foreground">
            {posts.length} publicaciones planificadas
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="size-4" /> Añadir
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no hay contenido. Pulsa «Añadir» para planificar tu primera
          publicación.
        </div>
      ) : (
        <DndContext
          id="ig-feed"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={posts.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
              {posts.map((p) => (
                <Tile key={p.id} post={p} onOpen={() => setEditing(p)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <PostModal open={creating} onClose={() => setCreating(false)} />
      <PostModal
        key={editing?.id ?? "edit"}
        open={!!editing}
        onClose={() => setEditing(null)}
        post={editing ?? undefined}
      />
    </div>
  );
}

function Tile({ post, onOpen }: { post: FeedPost; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: post.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const s = STATUS[post.status] ?? STATUS.idea;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "group relative aspect-square cursor-pointer touch-none overflow-hidden rounded-md bg-muted",
        isDragging && "z-10 opacity-60 ring-2 ring-primary",
      )}
    >
      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.imageUrl}
          alt={post.caption ?? ""}
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="size-6" />
        </div>
      )}
      <span
        className={cn(
          "absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-white",
          s.dot,
        )}
        title={s.label}
      />
      {post.caption && (
        <div className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent p-2 text-[11px] leading-tight text-white opacity-0 transition group-hover:opacity-100">
          {post.caption}
        </div>
      )}
    </div>
  );
}
