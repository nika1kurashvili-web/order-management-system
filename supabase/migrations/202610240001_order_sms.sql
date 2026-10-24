-- SMS log: one row per (order, kind) so a customer never gets the same SMS twice.
create table if not exists public.order_sms (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  kind text not null check (kind in ('onway','courier')),
  phone text,
  content text,
  provider_response text,
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);
alter table public.order_sms enable row level security;
grant select, insert, update, delete on public.order_sms to service_role;
