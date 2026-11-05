import Link from "next/link";

import { Avatar, type Person } from "@/components/app/couple";
import { formatBRL } from "@/lib/domain/money";

const when = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export type ApprovalRow = {
  id: string;
  requested_by: string;
  title: string;
  amount_cents: number;
  installments: number;
  note: string | null;
  status: "pending" | "approved" | "talk" | "talked";
  responded_by: string | null;
  response_note: string | null;
  outcome_note: string | null;
  talked_at: string | null;
  created_at: string;
};

function relative(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString() ? `hoje, ${time.format(date)}` : when.format(date);
}

/** 05 · Card de pedido de combinado: neutral colors only; "aprovar" / "vamos conversar", never "negado". */
export function ApprovalCard({ row, people, viewerId }: { row: ApprovalRow; people: Map<string, Person>; viewerId: string }) {
  const requester = people.get(row.requested_by);
  const responder = row.responded_by ? people.get(row.responded_by) : undefined;
  const waitingMe = row.status === "pending" && row.requested_by !== viewerId;
  const status =
    row.status === "pending"
      ? waitingMe ? "Esperando você" : `Esperando ${[...people.values()].find((p) => p.name !== requester?.name)?.name ?? "seu par"}`
      : row.status === "approved"
        ? `Aprovado por ${responder?.name ?? "seu par"}`
        : row.status === "talk"
          ? "Vamos conversar"
          : `Vamos conversar · conversado em ${row.talked_at ? day.format(new Date(row.talked_at)) : ""}`;

  return (
    <li className="grid gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        {requester ? <Avatar person={requester} size={32} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{row.title}</span>
          <span className="block text-[13px] text-muted-foreground">{requester?.name ?? ""} · {relative(row.created_at)}</span>
        </span>
        <span className="tabular text-[15px] font-medium">{formatBRL(row.amount_cents)}</span>
      </div>
      {row.note ? <p className="text-sm text-muted-foreground">“{row.note}”</p> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{status}</span>
        {waitingMe ? <Link href={`/couple/approvals/${row.id}`} className="text-sm font-medium">Responder</Link> : null}
      </div>
      {row.response_note && responder ? (
        <p className="flex items-start gap-2 text-sm"><Avatar person={responder} size={22} /><span className="text-muted-foreground">“{row.response_note}”</span></p>
      ) : null}
      {row.outcome_note ? <p className="text-[13px] text-muted-foreground">{row.outcome_note}</p> : null}
    </li>
  );
}
