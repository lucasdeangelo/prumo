"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { HIDE_VALUES_ATTR as ATTR, HIDE_VALUES_KEY } from "@/lib/hide-values";
import { cn } from "@/lib/utils";

const listeners = new Set<() => void>();

function apply(hidden: boolean) {
  document.documentElement.toggleAttribute(ATTR, hidden);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it: follow along.
  const onStorage = (e: StorageEvent) => {
    if (e.key === HIDE_VALUES_KEY) apply(e.newValue === "1");
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const isHidden = () => document.documentElement.hasAttribute(ATTR);

export function HideValuesToggle({ className }: { className?: string }) {
  const hidden = useSyncExternalStore(subscribe, isHidden, () => false);

  function toggle() {
    const next = !isHidden();
    apply(next);
    try {
      if (next) localStorage.setItem(HIDE_VALUES_KEY, "1");
      else localStorage.removeItem(HIDE_VALUES_KEY);
    } catch {
      // Private mode or blocked storage: it still works until the page is reloaded.
    }
  }

  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar valores" : "Esconder valores"}
      title={hidden ? "Mostrar valores" : "Esconder valores"}
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted", className)}
    >
      <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
    </button>
  );
}
