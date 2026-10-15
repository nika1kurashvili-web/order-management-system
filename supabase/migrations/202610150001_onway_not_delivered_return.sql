-- OnWay reported "არ ჩაბარდა" (status 34): move the order from "shipping" to
-- "return_pending" (უნდა დაბრუნდეს). Only the trusted server (service role) may call it.
-- Never touches an order that is not currently "shipping" (e.g. already delivered).
begin;

create or replace function public.nexo_mark_onway_return_pending(p_tracking text)
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
  if target.status = 'return_pending' then return 'already_return_pending'; end if;
  if target.status is distinct from 'shipping' then
    return 'skipped_' || coalesce(target.status::text, 'null');
  end if;

  previous_marker := current_setting('nexo.onway_result_order', true);
  perform set_config('nexo.onway_result_order', target.id::text, true);
  update public.orders set status = 'return_pending' where id = target.id;
  perform set_config('nexo.onway_result_order', coalesce(previous_marker, ''), true);
  return 'return_updated';
end $$;

revoke all on function public.nexo_mark_onway_return_pending(text) from public, anon, authenticated;
grant execute on function public.nexo_mark_onway_return_pending(text) to service_role;

commit;
