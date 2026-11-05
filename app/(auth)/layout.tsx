import Link from "next/link";

import { PrumoLogo } from "@/components/app/icons";

// Sign-in screens as designed: logo above a single white card on paper.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-10 px-5 py-10">
      <Link href="/" className="self-center no-underline">
        <PrumoLogo size="lg" />
      </Link>
      <div className="rounded-2xl border border-border bg-card p-6">{children}</div>
    </main>
  );
}
