import { nextOccurrence, occurrencesBetween, type RecurrenceType, type RecurrenceUnit } from "./recurrence";

export type ForecastBill = {
  id: string;
  description: string;
  amount_cents: number;
  type: "payable" | "receivable";
  due_date: string;
  status: string;
  recurrence_type: RecurrenceType;
  recurrence_interval: number | null;
  recurrence_unit: RecurrenceUnit | null;
  tag_id: string | null;
};

export type ForecastSubscription = {
  id: string;
  name: string;
  amount_cents: number;
  frequency: RecurrenceType;
  next_charge_date: string | null;
  status: string;
  tag_id: string | null;
};

export type ForecastItem = {
  key: string;
  kind: "bill" | "subscription";
  sourceId: string;
  description: string;
  amountCents: number;
  direction: "out" | "in";
  date: string;
  /** confirmed = a bill the user registered; predicted = projected from a recurrence. */
  state: "overdue" | "confirmed" | "predicted";
  tagId: string | null;
};

/**
 * Upcoming money movements in [from, to]. Registered pending bills are confirmed (or overdue);
 * later repetitions of recurring bills and subscription charges are predictions, never stored.
 */
export function buildForecast(input: {
  bills: ForecastBill[];
  subscriptions: ForecastSubscription[];
  today: string;
  to: string;
}): ForecastItem[] {
  const { today, to } = input;
  const items: ForecastItem[] = [];

  for (const bill of input.bills) {
    if (bill.status !== "pending" && bill.status !== "overdue") continue;
    if (bill.due_date > to) continue;
    const direction = bill.type === "payable" ? "out" : "in";
    items.push({
      key: `bill:${bill.id}`,
      kind: "bill",
      sourceId: bill.id,
      description: bill.description,
      amountCents: bill.amount_cents,
      direction,
      date: bill.due_date,
      state: bill.due_date < today ? "overdue" : "confirmed",
      tagId: bill.tag_id,
    });
    if (bill.recurrence_type !== "once") {
      const interval = bill.recurrence_interval ?? undefined;
      const unit = bill.recurrence_unit ?? undefined;
      const first = nextOccurrence(bill.due_date, bill.recurrence_type, interval, unit);
      for (const date of occurrencesBetween(first, bill.recurrence_type, today, to, { interval, unit, max: 24 })) {
        items.push({
          key: `bill:${bill.id}:${date}`,
          kind: "bill",
          sourceId: bill.id,
          description: bill.description,
          amountCents: bill.amount_cents,
          direction,
          date,
          state: "predicted",
          tagId: bill.tag_id,
        });
      }
    }
  }

  for (const sub of input.subscriptions) {
    if (sub.status !== "active" || !sub.next_charge_date) continue;
    for (const date of occurrencesBetween(sub.next_charge_date, sub.frequency, today, to, { max: 24 })) {
      items.push({
        key: `sub:${sub.id}:${date}`,
        kind: "subscription",
        sourceId: sub.id,
        description: sub.name,
        amountCents: sub.amount_cents,
        direction: "out",
        date,
        state: "predicted",
        tagId: sub.tag_id,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

export function forecastTotals(items: ForecastItem[]) {
  let outCents = 0;
  let inCents = 0;
  for (const item of items) {
    if (item.direction === "out") outCents += item.amountCents;
    else inCents += item.amountCents;
  }
  return { outCents, inCents, netCents: inCents - outCents };
}
