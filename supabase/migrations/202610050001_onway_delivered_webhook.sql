-- Marks an OnWay order as delivered when OnWay reports it. Only the trusted Next.js
-- server (service role) may call it. It changes nothing except shipping -> delivered
-- and reuses the existing service-role marker so the operator-protection trigger allows it.
begin;

create or replace function public.nexo_mark_onway_delivered(p_tracking text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  target public.orders%rowtype;
  matches integer;
  previous_marker text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization required';
  end if;
  if nullif(btrim(p_tracking), '') is null then return 'no_tracking'; end if;

  select count(*) into matches from public.orders
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method = 'onway';
  if matches = 0 then return 'not_found'; end if;
  if matches > 1 then return 'ambiguous'; end if;

  select * into target from public.orders
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method = 'onway'
    for update;
  if target.status = 'delivered' then return 'already_delivered'; end if;
  if target.status is distinct from 'shipping' then
    return 'skipped_' || coalesce(target.status::text, 'null');
  end if;

  previous_marker := current_setting('nexo.onway_result_order', true);
  perform set_config('nexo.onway_result_order', target.id::text, true);
  update public.orders set status = 'delivered' where id = target.id;
  perform set_config('nexo.onway_result_order', coalesce(previous_marker, ''), true);
  return 'updated';
end $$;

revoke all on function public.nexo_mark_onway_delivered(text) from public, anon, authenticated;
grant execute on function public.nexo_mark_onway_delivered(text) to service_role;

commit;
