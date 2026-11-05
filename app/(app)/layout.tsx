import Link from "next/link";

import { BottomNav } from "@/components/app/bottom-nav";
import { PlusIcon } from "@/components/app/icons";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-svh pb-[calc(9rem+env(safe-area-inset-bottom))]">
      {/* Thin Prumo-green line at the top of every app screen, as in the designs. */}
      <div aria-hidden="true" className="h-[3px] bg-primary" />
      <main className="mx-auto w-full max-w-2xl px-5 pt-[max(28px,env(safe-area-inset-top))]">{children}</main>
      <Link
        href="/transactions/new"
        aria-label="Nova movimentação"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(18,21,18,0.18)] hover:bg-primary-press hover:text-primary-foreground sm:right-[max(1.25rem,calc(50vw-20rem))]"
      >
        <PlusIcon className="size-6" strokeWidth={1.8} />
      </Link>
      <BottomNav />
    </div>
  );
}
