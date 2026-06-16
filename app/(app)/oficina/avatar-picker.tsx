"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AVATAR_SEEDS, dicebearUrl } from "@/lib/avatars";
import { setAvatar } from "./avatar-actions";

export function AvatarPicker({ initialSeed }: { initialSeed: string }) {
  const [seed, setSeed] = useState(initialSeed);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar el desplegable al hacer clic fuera.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(s: string) {
    setSeed(s);
    setOpen(false);
    startTransition(async () => {
      await setAvatar(s);
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm font-medium shadow-sm transition-colors hover:border-primary disabled:opacity-60"
        disabled={pending}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dicebearUrl(seed)}
          alt="Tu avatar"
          className="size-8 rounded-full bg-muted [image-rendering:pixelated]"
        />
        <span className="hidden sm:inline">Mi avatar</span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-3 shadow-xl">
          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            Elige tu personaje · lo verán los demás
          </p>
          <div className="grid grid-cols-4 gap-2">
            {AVATAR_SEEDS.map((s) => {
              const active = s === seed;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => choose(s)}
                  className={
                    "relative flex items-center justify-center rounded-lg border p-1 transition-colors " +
                    (active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border hover:border-primary")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dicebearUrl(s)}
                    alt={s}
                    className="size-12 [image-rendering:pixelated]"
                  />
                  {active && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
