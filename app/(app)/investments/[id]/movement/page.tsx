import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/bits";
import { AssetTile } from "@/components/app/investments";
import { Money } from "@/components/app/money";
import { MovementForm, type MovementKind } from "@/components/app/movement-form";
import { getHousehold } from "@/lib/application/household";
import { investmentForViewer } from "@/lib/application/investments";
import { valuation } from "@/lib/application/manual-investments";
import { requireUser } from "@/lib/auth/session";
import { todayIn } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";

export const metadata = { title: "Movimentação · Prumo" };

const TITLE: Record<MovementKind, string> = { aporte: "Novo aporte", resgate: "Resgate", compra: "Compra", venda: "Venda", cotacao: "Atualizar cotação", valor: "Atualizar valor" };

/** Movements are recorded only on assets typed by hand; connected ones come from the bank. */
export default async function MovementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const [{ id }, { tipo }] = await Promise.all([params, searchParams]);
  const { user } = await requireUser();
  const household = await getHousehold(user.id);
  const found = /^[0-9a-f-]{36}$/i.test(id) ? await investmentForViewer(user.id, household, id) : null;
  if (!found || !found.owner || found.row.source !== "manual" || found.row.status === "withdrawn") notFound();
  const { row } = found;
  const how = valuation(row.type, row.subtype);
  const allowed: MovementKind[] = how === "quote" ? ["compra", "venda", "cotacao"] : how === "total" ? ["aporte", "resgate", "valor"] : ["aporte", "resgate"];
  const kind = allowed.find((k) => k === tipo) ?? allowed[0];

  return (
    <div className="grid gap-4">
      <PageHeader title={TITLE[kind]} back={`/investments/${row.id}`} />
      <div className="flex items-center gap-3">
        <AssetTile type={row.type} subtype={row.subtype} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-[15px] font-medium">{row.name}</span>
          <span className="tabular text-[13px] text-muted-foreground">
            <Money cents={row.amount_cents} />{row.quantity !== null && how === "quote" ? ` · ${row.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 })} unidades` : ""}
          </span>
        </span>
      </div>
      <MovementForm
        investmentId={row.id}
        kind={kind}
        today={todayIn()}
        currentPrice={row.unit_value_cents !== null ? centsToInput(row.unit_value_cents) : ""}
        currentAmount={centsToInput(row.amount_cents)}
      />
    </div>
  );
}
