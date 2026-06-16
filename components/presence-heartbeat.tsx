"use client";

import { useEffect } from "react";

/** Marca al usuario como conectado mientras tenga el ERP abierto. */
export function PresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      fetch("/api/presence", { method: "POST" }).catch(() => {});
    };
    beat();
    const iv = setInterval(beat, 25000);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
