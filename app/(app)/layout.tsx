import Link from "next/link";
import { Suspense } from "react";

import { BottomNav } from "@/components/app/bottom-nav";
import { spaceColor } from "@/components/app/couple";
import { PlusIcon } from "@/components/app/icons";
import { getHousehold } from "@/lib/application/household";
import { requireUser } from "@/lib/auth/session";
import { monthOf, todayIn } from "@/lib/domain/dates";
import { currentSpace } from "@/lib/space";

export const dynamic = "force-dynamic";

// The layout itself waits on nothing, so the frame and the page's loading state show at once.
// Every page verifies the user on its own (requireUser).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh pb-[calc(9rem+env(safe-area-inset-bottom))]">
      <Suspense fallback={<div aria-hidden="true" className="h-[3px]" />}>
        <SpaceRule />
      </Suspense>
      <main className="mx-auto w-full max-w-2xl px-5 pt-[max(28px,env(safe-area-inset-top))]">{children}</main>
      <Link
        href="/transactions/new"
        aria-label="Nova movimentação"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(18,21,18,0.18)] hover:bg-primary-press hover:text-primary-foreground sm:right-[max(1.25rem,calc(50vw-20rem))]"
      >
        <PlusIcon className="size-6" strokeWidth={1.8} />
      </Link>
      <BottomNav month={monthOf(todayIn())} />
    </div>
  );
}

/** The top rule tells where you are: your color in Meu, Prumo green in Nosso. */
async function SpaceRule() {
  const { user } = await requireUser();
  const [household, space] = await Promise.all([getHousehold(user.id), currentSpace()]);
  const rule = spaceColor(household?.partner ? space : "meu", household?.me.color ?? "blue");
  return <div aria-hidden="true" className="h-[3px]" style={{ background: rule }} />;
}
