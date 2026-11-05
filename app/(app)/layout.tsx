import { Plus } from "lucide-react";
import Link from "next/link";

import { BottomNav } from "@/components/app/bottom-nav";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-svh pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <main className="mx-auto w-full max-w-2xl px-4 pt-[max(8px,env(safe-area-inset-top))]">{children}</main>
      <Link
        href="/transactions/new"
        aria-label="Nova movimentação"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/20 hover:opacity-90 sm:right-[max(1rem,calc(50vw-20rem))]"
      >
        <Plus aria-hidden="true" className="size-6" />
      </Link>
      <BottomNav />
    </div>
  );
}
