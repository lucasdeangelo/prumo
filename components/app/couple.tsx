// Couple components from the design ("Componentes do casal"): where you are and who sees it.
// Blue = Ana's Meu space (terracotta for Rafa). Prumo green = Nosso. Visibility never uses red.
import Link from "next/link";

import { setSpaceAction } from "@/app/(app)/couple-actions";
import { formatBRL } from "@/lib/domain/money";
import { cn } from "@/lib/utils";

export type PersonColor = "blue" | "terracotta";
export type Person = { name: string; initial: string; color: PersonColor };

export const PERSON_BG: Record<PersonColor, string> = { blue: "#3A5BA0", terracotta: "#B4582A" };
export const PERSON_TINT: Record<PersonColor, string> = { blue: "#E6ECF6", terracotta: "#F6E8DE" };
export const SPACE_COLOR = { nosso: "#1D4D3F" } as const;

export function spaceColor(space: "meu" | "nosso", me: PersonColor): string {
  return space === "nosso" ? SPACE_COLOR.nosso : PERSON_BG[me];
}

export function Avatar({ person, size = 36, ring }: { person: Person; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", ring && "border-2 border-background")}
      style={{ width: size, height: size, background: PERSON_BG[person.color], fontSize: Math.round(size * 0.36) }}
    >
      {person.initial}
    </span>
  );
}

/** "Casal · avatares: sempre juntos, sempre na mesma ordem." */
export function CoupleAvatars({ people, size = 36 }: { people: Person[]; size?: number }) {
  return (
    <span className="flex" aria-label={people.map((p) => p.name).join(" e ")}>
      {people.map((p, i) => (
        <span key={p.name + i} style={{ marginLeft: i === 0 ? 0 : -Math.round(size / 3) }}>
          <Avatar person={p} size={size} ring />
        </span>
      ))}
    </span>
  );
}

/** 01 · Seletor de espaço: segmented Meu | Nosso with the "who sees" caption under it. */
export function SpaceSwitcher({ space, me, partner, returnTo }: { space: "meu" | "nosso"; me: Person; partner: Person | null; returnTo: string }) {
  // "Sempre juntos, sempre na mesma ordem": the blue person first for both of them.
  const pair = partner ? (me.color === "blue" ? [me, partner] : [partner, me]) : [me];
  const caption = space === "nosso" ? `${pair.map((p) => p.name).join(" e ")} veem este espaço` : `Seu espaço. ${partner?.name ?? "Seu par"} só vê o que você compartilha.`;
  return (
    <div className="flex flex-col gap-2">
      <form action={setSpaceAction} className="flex items-center gap-3">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-full bg-muted p-1" role="group" aria-label="Espaço">
          {(["meu", "nosso"] as const).map((value) => {
            const active = value === space;
            return (
              <button
                key={value}
                type="submit"
                name="space"
                value={value}
                aria-pressed={active}
                className={cn("min-h-10 rounded-full text-sm font-medium transition", active ? "bg-card font-semibold shadow-[0_1px_3px_rgba(18,21,18,0.1)]" : "text-muted-foreground hover:text-foreground")}
                style={active ? { color: spaceColor(value, me.color) } : undefined}
              >
                {value === "meu" ? "Meu" : "Nosso"}
              </button>
            );
          })}
        </div>
        {space === "nosso" && partner ? <CoupleAvatars people={pair} size={32} /> : <Avatar person={me} size={32} />}
      </form>
      <p className="px-1 text-[13px] text-muted-foreground">{caption}</p>
    </div>
  );
}

/** Small chip next to "Voltar" on inner screens: which space this belongs to and who sees it. */
export function SpaceChip({ space, caption, me }: { space: "meu" | "nosso"; caption: string; me: PersonColor }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12px] font-medium" style={{ color: spaceColor(space, me) }}>
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: spaceColor(space, me) }} />
      {caption}
    </span>
  );
}

export type VisibilityKind = "private" | "totals" | "details" | "hidden" | "category_only" | "surprise";

const VISIBILITY_LABEL: Record<Exclude<VisibilityKind, "surprise">, string> = {
  private: "Só eu vejo",
  totals: "Só totais",
  details: "Com detalhes",
  hidden: "Oculto",
  category_only: "Só categoria",
};

/** 02 · Selo de visibilidade: 11px, radius 6, line border; icon + text. Only the surprise is colored. */
export function VisibilityBadge({ kind, partnerName, until }: { kind: VisibilityKind; partnerName?: string; until?: string }) {
  const text =
    kind === "surprise"
      ? `Surpresa até ${until ?? ""}`
      : kind === "hidden"
        ? `Oculto de ${partnerName ?? "seu par"}`
        : kind === "category_only"
          ? `${partnerName ?? "Seu par"} vê só categoria`
          : VISIBILITY_LABEL[kind];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[11px] font-medium",
        kind === "surprise" ? "border-[#E8D9C7] bg-[#FBF4EC] text-[#8A4A1E]" : "border-border bg-card text-muted-foreground",
      )}
    >
      <VisibilityIcon kind={kind} />
      {text}
    </span>
  );
}

function VisibilityIcon({ kind }: { kind: VisibilityKind }) {
  const common = { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "private" || kind === "hidden") return <svg {...common}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
  if (kind === "totals") return <svg {...common}><path d="M5 12h14M5 7h14M5 17h8" /></svg>;
  if (kind === "surprise") return <svg {...common}><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5 0M12 9c2-4 6-3 5 0" /></svg>;
  return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
}

const updatedFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** 06 · "Atualizado em": on every screen with balances. Tapping opens the daily update help. */
export function UpdatedAt({ at, state = "ok", failedNote }: { at: string | null; state?: "ok" | "expired" | "failed"; failedNote?: string }) {
  if (!at) return null;
  const [date, time] = updatedFormat.format(new Date(at)).split(", ");
  const text = state === "failed" ? failedNote ?? `Falhou hoje · dados de ${date}` : state === "expired" ? `Atualizado em ${date} · autorização vencida` : `Atualizado em ${date} às ${time}`;
  return (
    <Link href="/help/updates" className={cn("inline-flex items-center gap-1.5 text-[13px]", state === "ok" ? "text-muted-foreground hover:text-foreground" : "text-danger hover:text-danger")}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", state === "ok" ? "bg-primary" : "bg-danger")} />
      {text}
    </Link>
  );
}

/** 04 · Barra de progresso: 8px, segments with 2px gap, always with the value in text nearby. */
export function SegmentBar({ segments, total, label, overColor }: { segments: Array<{ value: number; color: string }>; total: number; label: string; overColor?: string }) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const scale = Math.max(total, sum, 1);
  return (
    <div role="img" aria-label={label} className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-border">
      {segments.filter((s) => s.value > 0).map((s, i) => (
        <div key={i} style={{ width: `${(s.value / scale) * 100}%`, background: sum > total && overColor ? overColor : s.color }} />
      ))}
    </div>
  );
}

/** Budget bar: green inside, amber from 80%, red only when the household budget is over. */
export function BudgetBar({ spentCents, limitCents }: { spentCents: number; limitCents: number }) {
  const ratio = limitCents > 0 ? spentCents / limitCents : 0;
  const color = ratio > 1 ? "var(--danger)" : ratio >= 0.8 ? "#C08A1E" : "var(--primary)";
  return (
    <div role="img" aria-label={`${Math.round(ratio * 100)}% de ${formatBRL(limitCents)}`} className="h-2 overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
    </div>
  );
}

/** Row icon for an institution: two letters in a soft square ("Nu", "In", "XP"). */
export function InstitutionMark({ name }: { name: string }) {
  const short = name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2) || "?";
  const lower = name.toLowerCase();
  const bg = lower.includes("nu") ? "#820AD1" : lower.includes("inter") ? "#FF7A00" : lower.includes("itau") || lower.includes("itaú") ? "#EC7000" : lower.includes("xp") ? "#121512" : lower.includes("c6") ? "#242424" : "#5E625C";
  return (
    <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-semibold text-white" style={{ background: bg }}>
      {short.charAt(0).toUpperCase() + short.slice(1).toLowerCase()}
    </span>
  );
}
