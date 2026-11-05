import type { RecurrenceType, RecurrenceUnit } from "@/lib/domain/recurrence";

// Hand-written row shapes for the columns the app reads. The migrations are the source of truth.

export type Tag = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  is_default: boolean;
  excluded_from_totals: boolean;
};

export type TagRuleRow = {
  id: string;
  pattern: string;
  pattern_type: "merchant" | "description" | "contains" | "exact";
  tag_id: string;
  priority: number;
};

export type Account = {
  id: string;
  name: string;
  type: string | null;
  subtype: string | null;
  balance_cents: number | null;
  balance_synced_at: string | null;
  is_manual: boolean;
  pluggy_item_id: string | null;
  archived_at: string | null;
};

export type PluggyItem = {
  id: string;
  pluggy_item_id: string;
  institution_name: string | null;
  status: string | null;
  error_code: string | null;
  last_sync_at: string | null;
};

export type Transaction = {
  id: string;
  account_id: string | null;
  amount_cents: number;
  type: "credit" | "debit";
  provider_description: string | null;
  user_description: string | null;
  merchant: string | null;
  normalized_merchant: string | null;
  transaction_date: string;
  tag_id: string | null;
  category_confidence: number | null;
  category_source: string | null;
  source: string;
  is_reviewed: boolean;
};

export type UpcomingBill = {
  id: string;
  account_id: string | null;
  description: string;
  amount_cents: number;
  type: "payable" | "receivable";
  due_date: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  recurrence_type: RecurrenceType;
  recurrence_interval: number | null;
  recurrence_unit: RecurrenceUnit | null;
  tag_id: string | null;
  notify_days_before: number;
  matched_transaction_id: string | null;
  paid_at: string | null;
};

export type Subscription = {
  id: string;
  name: string;
  normalized_name: string;
  amount_cents: number;
  frequency: RecurrenceType;
  next_charge_date: string | null;
  account_id: string | null;
  tag_id: string | null;
  status: "candidate" | "active" | "paused" | "cancelled" | "rejected";
  is_auto_detected: boolean;
  detection_confidence: number | null;
  notify_days_before: number;
};

export const TRANSACTION_COLUMNS =
  "id, account_id, amount_cents, type, provider_description, user_description, merchant, normalized_merchant, transaction_date, tag_id, category_confidence, category_source, source, is_reviewed";
export const BILL_COLUMNS =
  "id, account_id, description, amount_cents, type, due_date, status, recurrence_type, recurrence_interval, recurrence_unit, tag_id, notify_days_before, matched_transaction_id, paid_at";
export const SUBSCRIPTION_COLUMNS =
  "id, name, normalized_name, amount_cents, frequency, next_charge_date, account_id, tag_id, status, is_auto_detected, detection_confidence, notify_days_before";
export const TAG_COLUMNS = "id, name, color, icon, is_default, excluded_from_totals";
export const ACCOUNT_COLUMNS = "id, name, type, subtype, balance_cents, balance_synced_at, is_manual, pluggy_item_id, archived_at";

export function transactionLabel(tx: Pick<Transaction, "user_description" | "provider_description" | "merchant">): string {
  return tx.user_description || tx.merchant || tx.provider_description || "Sem descrição";
}
