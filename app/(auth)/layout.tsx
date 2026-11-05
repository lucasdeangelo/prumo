import { Waypoints } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2.5 self-center" aria-label="Prumo">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-800 text-white dark:bg-emerald-400 dark:text-emerald-950">
          <Waypoints aria-hidden="true" size={21} strokeWidth={2.5} />
        </span>
        <span className="text-xl font-semibold tracking-tight">prumo<span className="text-emerald-700 dark:text-emerald-400">.</span></span>
      </Link>
      <div className="rounded-3xl border border-border bg-card p-5">{children}</div>
    </main>
  );
}
