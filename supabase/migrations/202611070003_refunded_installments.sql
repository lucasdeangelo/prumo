-- Installments of a refunded purchase.
-- When a store refunds an installment purchase, the bank credits what was already charged
-- ("Estorno de compra") and cancels the rest, but Open Finance may keep listing the remaining
-- installments as scheduled. Those are marked here and left out of every total.
begin;

alter table public.card_pending_items add column cancelled_by_refund boolean not null default false;

commit;
