"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const control =
  "min-h-11 w-full rounded-xl border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "appearance-auto pr-8", className)} {...props} />;
}

export function SubmitButton({ children, pendingText = "Salvando…", className, variant }: { children: React.ReactNode; pendingText?: string; className?: string; variant?: "default" | "secondary" | "outline" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className} variant={variant}>
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={cn("rounded-xl px-3 py-2 text-sm", state.error ? "bg-danger/10 text-danger" : "bg-secondary text-secondary-foreground")}>
      {state.error ?? state.ok}
    </p>
  );
}

/** Segmented radio control for 2-3 options (e.g. saída/entrada). */
export function Segmented({ name, options, defaultValue }: { name: string; options: Array<{ value: string; label: string }>; defaultValue: string }) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-muted p-1" role="radiogroup">
      {options.map((option) => (
        <label key={option.value} className="relative">
          <input type="radio" name={name} value={option.value} defaultChecked={option.value === defaultValue} className="peer sr-only" />
          <span className="flex min-h-10 cursor-pointer items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
