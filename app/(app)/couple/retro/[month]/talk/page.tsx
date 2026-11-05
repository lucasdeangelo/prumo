import { notFound, redirect } from "next/navigation";

import { finishRetroAction, markRetroPointAction } from "@/app/(app)/couple/plan-actions";
import { PageHeader } from "@/components/app/bits";
import { ShareImageButton } from "@/components/app/share-image";
import { Card, EmptyState } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/form";
import { requireUser } from "@/lib/auth/session";
import { getHousehold } from "@/lib/application/household";
import { loadRetro } from "@/lib/application/retro";
import { isMonthKey } from "@/lib/domain/dates";
import { formatBRL } from "@/lib/domain/money";

export const metadata = { title: "Pontos para conversar · Prumo" };

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });

export default async function TalkPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!isMonthKey(month)) notFound();
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  if (!household?.partner) redirect("/couple");
  const retro = await loadRetro(household, month);
  const name = monthName.format(new Date(`${month}-01T00:00:00Z`));
  const shareLines = [
    `Juntos em ${name}: ${formatBRL(retro.totalCents)}`,
    ...(retro.goalsSavedCents ? [`Nas metas: + ${formatBRL(retro.goalsSavedCents)}`] : []),
    ...retro.goalLines.slice(0, 2).map((g) => `${g.name}: ${g.percent}%`),
  ];

  return (
    <div className="grid gap-4">
      <PageHeader title="" back={`/couple/retro/${month}`} />
      <p className="label-mono">Retrospectiva · {name}</p>
      <h1 className="text-2xl font-medium tracking-[-0.02em]">Pontos para conversar</h1>
      <p className="text-sm text-muted-foreground">Sem pressa e sem placar. {retro.points.length ? `${retro.points.length === 1 ? "Uma coisa" : `${retro.points.length === 2 ? "Duas" : "Três"} coisas`} que apareceram no mês.` : ""}</p>

      {retro.points.length === 0 ? <EmptyState title="Nada pedindo conversa">O mês ficou dentro do combinado.</EmptyState> : null}
      <ul className="grid gap-3">
        {retro.points.map((point) => {
          const done = retro.marked.has(point.key);
          return (
            <Card key={point.key} className="grid gap-2">
              <p className="text-[15px] font-medium">{point.title}</p>
              <p className="text-sm text-muted-foreground">{point.body}</p>
              {done ? (
                <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">Conversamos</span>
              ) : (
                <form action={markRetroPointAction}>
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="key" value={point.key} />
                  <SubmitButton variant="ghost" className="px-0 text-primary">Marcar como conversado</SubmitButton>
                </form>
              )}
            </Card>
          );
        })}
      </ul>

      {retro.done ? (
        <p role="status" className="rounded-[10px] bg-secondary px-3 py-2.5 text-center text-sm text-secondary-foreground">Retrospectiva concluída.</p>
      ) : (
        <form action={finishRetroAction}>
          <input type="hidden" name="month" value={month} />
          <SubmitButton className="w-full">Concluir retrospectiva</SubmitButton>
        </form>
      )}
      <ShareImageButton title={`${name.charAt(0).toUpperCase() + name.slice(1)} a dois`} lines={shareLines} />
      <p className="text-center text-[13px] text-muted-foreground">A imagem mostra só totais do casal e metas, sem valores de cada um.</p>
    </div>
  );
}
