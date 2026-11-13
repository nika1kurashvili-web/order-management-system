-- Easy (easy.online.ge) courier: new delivery method "easy".
-- Mirrors the OnWay behaviour:
--   * result of the first send is saved by a service-role-only RPC (tracking + status shipping + fee)
--   * "ჩაბარებულია"  -> delivered   (from shipping AND return_pending)
--   * "არ ჩაიბარა"   -> return_pending (from shipping only)
--   * POS return "არ ჩაბარდა" also finds Easy orders by tracking.
begin;

-- 1) allow the value "easy" in orders.delivery_method (enum or CHECK constraint)
do $$
declare col record; c record;
begin
  select data_type, udt_name into col from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_method';
  if col.data_type = 'USER-DEFINED' then
    execute format('alter type public.%I add value if not exists %L', col.udt_name, 'easy');
  else
    for c in select conname from pg_constraint
             where conrelid = 'public.orders'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%delivery_method%' loop
      execute format('alter table public.orders drop constraint %I', c.conname);
    end loop;
    alter table public.orders add constraint orders_delivery_method_check
      check (delivery_method in ('onway', 'private_courier', 'warehouse_pickup', 'easy'));
  end if;
end $$;

-- 2) save the result of the first Easy send (never sends anything itself)
create or replace function public.nexo_record_easy_result(
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
  if not found or (actor_role = 'operator' and target.created_by is distinct from p_actor) then
    raise exception 'Order access denied';
  end if;
  if target.delivery_method::text is distinct from 'easy'
     or nullif(btrim(target.tracking_code), '') is not null then
    raise exception 'Order is not eligible for an initial Easy result';
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
revoke all on function public.nexo_record_easy_result(text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.nexo_record_easy_result(text, uuid, text, numeric) to service_role;

-- 3) "ჩაბარებულია": shipping or return_pending -> delivered
create or replace function public.nexo_mark_easy_delivered(p_tracking text)
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
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method::text = 'easy';
  if matches = 0 then return 'not_found'; end if;
  if matches > 1 then return 'ambiguous'; end if;

  select * into target from public.orders
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method::text = 'easy'
    for update;
  if target.status = 'delivered' then return 'already_delivered'; end if;
  if target.status::text not in ('shipping', 'return_pending') then
    return 'skipped_' || coalesce(target.status::text, 'null');
  end if;

  previous_marker := current_setting('nexo.onway_result_order', true);
  perform set_config('nexo.onway_result_order', target.id::text, true);
  update public.orders set status = 'delivered' where id = target.id;
  perform set_config('nexo.onway_result_order', coalesce(previous_marker, ''), true);
  return 'updated';
end $$;
revoke all on function public.nexo_mark_easy_delivered(text) from public, anon, authenticated;
grant execute on function public.nexo_mark_easy_delivered(text) to service_role;

-- 4) "არ ჩაიბარა": shipping -> return_pending
create or replace function public.nexo_mark_easy_return_pending(p_tracking text)
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
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method::text = 'easy';
  if matches = 0 then return 'not_found'; end if;
  if matches > 1 then return 'ambiguous'; end if;

  select * into target from public.orders
    where btrim(tracking_code) = btrim(p_tracking) and delivery_method::text = 'easy'
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
revoke all on function public.nexo_mark_easy_return_pending(text) from public, anon, authenticated;
grant execute on function public.nexo_mark_easy_return_pending(text) to service_role;

-- 5) POS return "არ ჩაბარდა" -> "returned" now also finds Easy orders (was OnWay only)
create or replace function public.nexo_pos_return_mark_returned()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  trk text;
  matches integer;
  target public.orders%rowtype;
  previous_marker text;
  outcome text;
begin
  begin
    select nullif(btrim(tracking_code), '') into trk from public.pos_sales where id = new.sale_id;
    if trk is null then
      outcome := 'no_tracking';
    else
      select count(*) into matches from public.orders
        where btrim(tracking_code) = trk and delivery_method::text in ('onway', 'easy');
      if matches = 0 then outcome := 'not_found';
      elsif matches > 1 then outcome := 'ambiguous';
      else
        select * into target from public.orders
          where btrim(tracking_code) = trk and delivery_method::text in ('onway', 'easy') for update;
        if target.status::text = 'returned' then outcome := 'already_returned';
        elsif target.status::text not in ('shipping', 'return_pending') then
          outcome := 'skipped_' || target.status::text;
        else
          previous_marker := current_setting('nexo.pos_return_order', true);
          perform set_config('nexo.pos_return_order', target.id::text, true);
          update public.orders set status = 'returned' where id = target.id;
          perform set_config('nexo.pos_return_order', coalesce(previous_marker, ''), true);
          outcome := 'returned';
        end if;
      end if;
    end if;
    insert into public.nexo_pos_return_log (return_id, tracking, result) values (new.id, trk, outcome);
  exception when others then
    begin
      insert into public.nexo_pos_return_log (return_id, tracking, result)
        values (new.id, trk, 'error: ' || sqlerrm);
    exception when others then null;
    end;
  end;
  return null;
end $$;

commit;

-- Rollback (only stops the new functions; the allowed value "easy" stays harmless):
-- drop function if exists public.nexo_record_easy_result(text, uuid, text, numeric);
-- drop function if exists public.nexo_mark_easy_delivered(text);
-- drop function if exists public.nexo_mark_easy_return_pending(text);
