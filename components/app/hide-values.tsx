"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";

import { HIDE_VALUES_ATTR as ATTR, SHOW_VALUES_KEY } from "@/lib/hide-values";
import { cn } from "@/lib/utils";

const listeners = new Set<() => void>();

function apply(hidden: boolean) {
  document.documentElement.toggleAttribute(ATTR, hidden);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const isHidden = () => document.documentElement.hasAttribute(ATTR);

export function HideValuesToggle({ className }: { className?: string }) {
  // The server renders hidden too: every visit starts masked (lib/hide-values.ts).
  const hidden = useSyncExternalStore(subscribe, isHidden, () => true);

  function toggle() {
    const next = !isHidden();
    apply(next);
    try {
      // Shown values last for this tab only; the next visit starts hidden again.
      if (next) sessionStorage.removeItem(SHOW_VALUES_KEY);
      else sessionStorage.setItem(SHOW_VALUES_KEY, "1");
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
