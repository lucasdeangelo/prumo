"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CalendarIcon, CardIcon, HomeIcon, RepeatIcon, TrendIcon } from "@/components/app/icons";
import { cn } from "@/lib/utils";

// Navigation map: fixed bottom bar Início · Mês · Cartões · Assinaturas · Investimentos.
// Upcoming bills live under Mês; Ajustes (tags, connections) opens from the gear on Início.
const ITEMS = [
  { href: "/overview", label: "Início", icon: HomeIcon, match: ["/overview", "/settings"] },
  { href: "/monthly", label: "Mês", icon: CalendarIcon, match: ["/monthly", "/upcoming", "/transactions"] },
  { href: "/cards", label: "Cartões", icon: CardIcon, match: ["/cards"] },
  { href: "/subscriptions", label: "Assinaturas", icon: RepeatIcon, match: ["/subscriptions"] },
  { href: "/investments", label: "Investimentos", icon: TrendIcon, match: ["/investments"] },
];

/** `month` (AAAA-MM) points Mês straight at the current month, skipping a redirect. */
export function BottomNav({ month }: { month: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-2xl grid-cols-5 px-2 pt-1.5 pb-2">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
          return (
            <li key={href}>
              <Link
                href={href === "/monthly" ? `/monthly/${month}` : href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-col items-center justify-center gap-1 text-[11px] no-underline",
                  active ? "font-semibold text-primary hover:text-primary" : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2 : 1.6} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
