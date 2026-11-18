-- Admin-only delivery fee correction (+/-) for Easy orders.
-- orders.delivery_fee stays the effective fee (base price from the table + this correction).
alter table public.orders add column if not exists fee_adjustment numeric not null default 0;

-- Rollback: alter table public.orders drop column if exists fee_adjustment;
