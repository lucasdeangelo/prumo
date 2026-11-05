import Link from "next/link";
import { notFound } from "next/navigation";

import { CoupleAvatars } from "@/components/app/couple";
import { ShareImageButton } from "@/components/app/share-image";
import { requireUser } from "@/lib/auth/session";
import { goalsOverview } from "@/lib/application/couple-data";
import { getHousehold } from "@/lib/application/household";
import { todayIn } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Marco da meta · Prumo" };

const TITLE: Record<string, string> = { "25": "Um quarto do caminho", "50": "Metade do caminho", "75": "Falta pouco", "100": "Meta concluída" };

export default async function MilestonePage({ params }: { params: Promise<{ id: string; pct: string }> }) {
  const { id, pct } = await params;
  if (!TITLE[pct]) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household) notFound();
  const goal = (await goalsOverview(household.id, todayIn())).find((g) => g.id === id);
  if (!goal) notFound();
  const people = household.partner ? (household.me.color === "blue" ? [household.me, household.partner] : [household.partner, household.me]) : [household.me];
  const together = people.length > 1;
  const months = goal.monthlyPaceCents > 0 ? Math.ceil(goal.progress.missingCents / goal.monthlyPaceCents) : null;
  const { count: linked } = await createAdminClient()
    .from("whatsapp_links")
    .select("user_id", { count: "exact", head: true })
    .in("user_id", people.map((p) => p.userId))
    .not("verified_at", "is", null)
    .is("revoked_at", null);
  const everyoneNotified = together && (linked ?? 0) >= 2;

  return (
    <div className="grid min-h-[70svh] content-center justify-items-center gap-5 text-center">
      <span className="flex size-28 items-center justify-center rounded-full bg-primary text-[34px] font-medium text-primary-foreground">{pct}%</span>
      <p className="label-mono">{goal.name}</p>
      <h1 className="text-[28px] font-medium tracking-[-0.02em]">{TITLE[pct]}</h1>
      <p className="max-w-xs text-[15px] text-muted-foreground">
        {together ? "Vocês já guardaram" : "Você já guardou"} {formatBRL(goal.savedCents)}{together ? " juntos" : ""}.
        {pct !== "100" && months ? ` Mais ${months === 1 ? "um mês" : `${months} meses`} nesse ritmo e ${together ? "vocês chegam" : "você chega"} lá.` : ""}
      </p>
      {together ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><CoupleAvatars people={people} size={28} /> {everyoneNotified ? "Os dois receberam este aviso" : "Os dois veem este marco no app"}</div>
      ) : null}
      <Link href={`/couple/goals/${goal.id}`} className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground hover:bg-primary-press hover:text-primary-foreground">Continuar</Link>
      <div className="w-full max-w-xs"><ShareImageButton title={`${goal.name}: ${pct}%`} lines={[`${TITLE[pct]}`, `${formatBRL(goal.savedCents)} guardados${together ? " juntos" : ""}`]} label="Compartilhar como imagem" /></div>
    </div>
  );
}
