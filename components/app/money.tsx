import { formatBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

/**
 * A formatted amount that "Esconder valores" can mask. Both forms are rendered and CSS picks one
 * (`html[data-hide-values]`), so it works in server components and switches without a reload.
 */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return <MaskedAmount text={formatBRL(cents)} className={className} />;
}

function MaskedAmount({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("money", className)}>
      <span className="money-value">{text}</span>
      <span className="money-mask">
        <span aria-hidden="true">R$ ••••</span>
        <span className="sr-only">valor oculto</span>
      </span>
    </span>
  );
}

// What formatBRL produces: "R$ 1.234,56", "-R$ 5,00" (Intl puts a no-break space after R$).
const BRL_IN_TEXT = /-?R\$[\s ]?\d[\d.]*,\d{2}/g;

/** Text built elsewhere with formatBRL inside (e.g. retro talk points): masks each amount in it. */
export function MaskedText({ children }: { children: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of children.matchAll(BRL_IN_TEXT)) {
    if (m.index > last) parts.push(children.slice(last, m.index));
    parts.push(<MaskedAmount key={m.index} text={m[0]} />);
    last = m.index + m[0].length;
  }
  if (last < children.length) parts.push(children.slice(last));
  return <>{parts}</>;
}
