-- Log of every status message received from OnWay and what the system did with it.
-- Written only by the Next.js server (service role); admins and managers may read it.
begin;

create table if not exists public.onway_webhook_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  tracking text not null,
  status_name text,
  status_id text,
  delivered boolean not null default false,
  -- updated | already_delivered | not_found | ambiguous | skipped_<status> | ignored | error
  result text,
  order_number text
);
create index if not exists onway_webhook_events_received_idx on public.onway_webhook_events (received_at desc);
create index if not exists onway_webhook_events_tracking_idx on public.onway_webhook_events (tracking);

alter table public.onway_webhook_events enable row level security;
alter table public.onway_webhook_events force row level security;
revoke all on public.onway_webhook_events from public, anon, authenticated;
grant select on public.onway_webhook_events to authenticated;
grant select, insert on public.onway_webhook_events to service_role;
grant usage, select on sequence public.onway_webhook_events_id_seq to service_role;

drop policy if exists onway_events_read on public.onway_webhook_events;
create policy onway_events_read on public.onway_webhook_events
  for select to authenticated
  using (public.nexo_active_role() in ('admin', 'manager'));

commit;
