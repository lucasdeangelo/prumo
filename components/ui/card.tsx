import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-2xl border border-border bg-card p-4 text-card-foreground", className)} {...props} />;
}

export function CardTitle({ className, children, action }: { className?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className={cn("text-base font-semibold", className)}>{children}</h2>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
