-- Run manually in Supabase SQL Editor before deploying the corresponding app.
-- Based on the supplied live schema export. No orders, products or FKs are deleted.
begin;

-- Refuse to install against a schema that would leave order children behind.
do $$
begin
  if (select count(*) from pg_catalog.pg_constraint
      where confrelid = 'public.orders'::regclass and contype = 'f' and confdeltype = 'c'
        and (conrelid, conname) in (
          ('public.order_items'::regclass, 'order_items_order_id_fkey'),
          ('public.order_status_history'::regclass, 'order_status_history_order_id_fkey'),
          ('public.order_activity'::regclass, 'order_activity_order_id_fkey')
        )) <> 3 then
    raise exception 'Verify order_items, order_status_history and order_activity ON DELETE CASCADE before deployment';
  end if;
end $$;

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'operator', 'manager'));

-- SECURITY DEFINER avoids recursively applying profiles RLS to its own policies.
create or replace function public.nexo_active_role()
returns text language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;
revoke all on function public.nexo_active_role() from public, anon;
grant execute on function public.nexo_active_role() to authenticated;

-- Keep the existing permissive admin/operator policies. Restrictive policies
-- additionally forbid every manager write, including writes to newly visible
-- orders through child-table EXISTS policies. NULL/inactive roles fail closed.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'orders', 'order_items', 'order_status_history', 'order_activity',
    'products', 'product_variants', 'profiles'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy nexo_no_manager_insert on public.%I as restrictive for insert to authenticated with check (public.nexo_active_role() in (''admin'', ''operator''))', table_name);
    execute format('create policy nexo_no_manager_update on public.%I as restrictive for update to authenticated using (public.nexo_active_role() in (''admin'', ''operator'')) with check (public.nexo_active_role() in (''admin'', ''operator''))', table_name);
    execute format('create policy nexo_no_manager_delete on public.%I as restrictive for delete to authenticated using (public.nexo_active_role() in (''admin'', ''operator''))', table_name);
  end loop;
end $$;

create policy nexo_manager_read_orders on public.orders
  for select to authenticated using (public.nexo_active_role() = 'manager');
-- Required by profiles(full_name) joins in Dashboard, order history and reports.
-- Does not grant profile writes or access to the Employees management UI.
create policy nexo_manager_read_profiles on public.profiles
  for select to authenticated using (public.nexo_active_role() = 'manager');
create policy nexo_manager_read_products on public.products
  for select to authenticated using (public.nexo_active_role() = 'manager');
-- Child SELECT policies already inherit the accessible order via EXISTS.
create policy nexo_orders_delete_admin_only on public.orders
  as restrictive for delete to authenticated using (public.is_admin());

create or replace function public.protect_order_operator_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;

  -- Only the service-role-only RPC below sets this transaction-local marker.
  -- Browser JWTs cannot take this branch even if they call set_config elsewhere.
  if auth.role() = 'service_role'
     and current_setting('nexo.onway_result_order', true) = old.id::text then
    return new;
  end if;

  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.nexo_active_role() is distinct from 'operator' then
    raise exception 'Only admins and operators may update orders';
  end if;
  if new.id is distinct from old.id
    or new.order_number is distinct from old.order_number
    or new.customer_name is distinct from old.customer_name
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_city is distinct from old.customer_city
    or new.customer_city_id is distinct from old.customer_city_id
    or new.customer_address is distinct from old.customer_address
    or new.customer_comment is distinct from old.customer_comment
    or new.payment_type is distinct from old.payment_type
    or new.delivery_method is distinct from old.delivery_method
    or new.package_weight is distinct from old.package_weight
    or new.subtotal is distinct from old.subtotal
    or new.delivery_fee is distinct from old.delivery_fee
    or new.discount is distinct from old.discount
    or new.total is distinct from old.total
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then raise exception 'Operator can only change status and tracking code'; end if;
  return new;
end $$;

-- Persists a courier response, never sends a shipment. Only the trusted Next.js
-- server may call it; p_actor is taken from getUser(), never from request JSON.
-- The row lock + empty-tracking check prevent overwriting later manual fees.
create or replace function public.nexo_record_onway_result(
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
  if target.delivery_method is distinct from 'onway'
     or nullif(btrim(target.tracking_code), '') is not null then
    raise exception 'Order is not eligible for an initial OnWay result';
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
revoke all on function public.nexo_record_onway_result(text, uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.nexo_record_onway_result(text, uuid, text, numeric)
  to service_role;

commit;
