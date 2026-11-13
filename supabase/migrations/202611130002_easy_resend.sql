-- Easy re-send: replaces the tracking code of an order that was already sent (also after the
-- courier was switched from OnWay to Easy). Admin any time; operator only on own order within
-- 24 hours. Delivered/cancelled orders cannot be re-sent. Never sends anything itself.
begin;

create or replace function public.nexo_record_easy_resend(
  p_order_id text, p_actor uuid, p_tracking text, p_delivery_fee numeric
)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  target public.orders%rowtype;
  actor_role text;
  previous_marker text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Server authorization required';
  end if;
  select role into actor_role from public.profiles where id = p_actor and active = true;
  if actor_role is null or actor_role not in ('admin', 'operator') then
    raise exception 'Order access denied';
  end if;
  select * into target from public.orders where id::text = p_order_id for update;
  if not found then raise exception 'Order access denied'; end if;
  if actor_role = 'operator'
     and (target.created_by is distinct from p_actor or target.created_at <= now() - interval '24 hours') then
    raise exception 'Order access denied';
  end if;
  if target.delivery_method::text is distinct from 'easy' then
    raise exception 'Order is not an Easy order';
  end if;
  if target.status::text in ('delivered', 'cancelled') then
    raise exception 'Delivered or cancelled orders cannot be re-sent';
  end if;
  if nullif(btrim(p_tracking), '') is null then raise exception 'Tracking is required'; end if;
  if p_delivery_fee is not null and
     (p_delivery_fee < 0 or p_delivery_fee::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Invalid delivery fee';
  end if;

  previous_marker := current_setting('nexo.onway_result_order', true);
  perform set_config('nexo.onway_result_order', target.id::text, true);
  update public.orders
    set tracking_code = btrim(p_tracking), status = 'shipping',
        delivery_fee = coalesce(p_delivery_fee, delivery_fee)
    where id = target.id;
  perform set_config('nexo.onway_result_order', coalesce(previous_marker, ''), true);
  return target.id::text;
end $$;
revoke all on function public.nexo_record_easy_resend(text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.nexo_record_easy_resend(text, uuid, text, numeric) to service_role;

commit;

-- Rollback: drop function if exists public.nexo_record_easy_resend(text, uuid, text, numeric);
