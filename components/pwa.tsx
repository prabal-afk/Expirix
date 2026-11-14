"use client";

import { useEffect } from "react";
import { registerWorker } from "@/lib/push";

/** Registers the service worker (needed for install and push) and remembers the browser's install prompt. */
export function PwaSetup() {
  useEffect(() => {
    void registerWorker();
    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __installPrompt?: Event }).__installPrompt = e;
      window.dispatchEvent(new Event("expirix:installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
