"use client";

import { CalendarClock, CalendarRange, Home, Repeat, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/overview", label: "Início", icon: Home },
  { href: "/monthly", label: "Mês", icon: CalendarRange },
  { href: "/upcoming", label: "Futuras", icon: CalendarClock },
  { href: "/subscriptions", label: "Assinaturas", icon: Repeat },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/80"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
