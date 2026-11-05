import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { isMonthKey, monthBounds } from "@/lib/domain/dates";
import { listAccounts, listTags, listTransactions } from "@/lib/repositories/reads";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { transactionLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

function csvCell(value: string): string {
  // Prevent spreadsheet formula injection from bank descriptions.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function GET(_request: Request, ctx: { params: Promise<{ month: string }> }) {
  const { month } = await ctx.params;
  if (!isMonthKey(month)) return NextResponse.json({ error: "Mês inválido" }, { status: 400 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = await createServerSupabaseClient();
  const { start, end } = monthBounds(month);
  const [txs, tags, accounts] = await Promise.all([
    listTransactions(db, user.id, { from: start, to: end, limit: 5000 }),
    listTags(db, user.id),
    listAccounts(db, user.id, true),
  ]);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const header = ["data", "descricao", "tipo", "valor", "tag", "conta", "origem"];
  const lines = txs.map((t) =>
    [
      t.transaction_date,
      transactionLabel(t),
      t.type === "credit" ? "entrada" : "saida",
      ((t.type === "credit" ? 1 : -1) * t.amount_cents / 100).toFixed(2).replace(".", ","),
      t.tag_id ? tagName.get(t.tag_id) ?? "" : "",
      t.account_id ? accountName.get(t.account_id) ?? "" : "",
      t.source,
    ].map(csvCell).join(";"),
  );
  const body = "﻿" + [header.join(";"), ...lines].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prumo-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
