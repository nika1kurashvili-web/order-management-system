-- Operators may edit their OWN orders (customer data, payment, delivery, discount, products)
-- during the first 24 hours after the order was created. Every change is logged in
-- order_activity with who/when/what (old -> new). OnWay can be re-sent within the same
-- window (admins: any time), which replaces the tracking code.
begin;

-- 1) Operator update rules ---------------------------------------------------
create or replace function public.protect_order_operator_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if public.is_admin() then return new; end if;

  if auth.role() = 'service_role'
     and current_setting('nexo.onway_result_order', true) = old.id::text then
    return new;
  end if;

  if pg_trigger_depth() > 1
     and current_setting('nexo.pos_return_order', true) = old.id::text
     and new.status::text = 'returned'
     and old.status::text in ('shipping', 'return_pending') then
    return new;
  end if;

  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.nexo_active_role() is distinct from 'operator' then
    raise exception 'Only admins and operators may update orders';
  end if;

  -- Never changeable by an operator.
  if new.id is distinct from old.id
    or new.order_number is distinct from old.order_number
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then raise exception 'Operator cannot change the order id, number, creator or date'; end if;

  -- Own order, first 24 hours: everything else may be edited.
  if old.created_by = auth.uid() and now() - old.created_at <= interval '24 hours' then
    return new;
  end if;

  -- Otherwise only status and tracking code.
  if new.customer_name is distinct from old.customer_name
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
  then raise exception 'Operator can only change status and tracking code'; end if;
  return new;
end $$;

-- 2) Products of an order: operator rights, own order, first 24 hours --------
drop policy if exists items_insert_own_or_admin on public.order_items;
create policy items_insert_own_or_admin on public.order_items for insert to authenticated
  with check (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (public.is_admin() or (o.created_by = auth.uid() and o.created_at > now() - interval '24 hours'))
  ));

drop policy if exists nexo_items_update_operator_24h on public.order_items;
create policy nexo_items_update_operator_24h on public.order_items for update to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_active_user()
      and o.created_by = auth.uid() and o.created_at > now() - interval '24 hours'
  ))
  with check (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_active_user()
      and o.created_by = auth.uid() and o.created_at > now() - interval '24 hours'
  ));

drop policy if exists nexo_items_delete_operator_24h on public.order_items;
create policy nexo_items_delete_operator_24h on public.order_items for delete to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and public.is_active_user()
      and o.created_by = auth.uid() and o.created_at > now() - interval '24 hours'
  ));

-- 3) History: one row per changed field (old -> new) ----------------------------
create or replace function public.log_order_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.order_activity(order_id, action, new_value, changed_by)
    values (new.id, 'created', new.status::text, coalesce(auth.uid(), new.created_by));
    return new;
  end if;

  v_actor := case
    when coalesce(current_setting('nexo.pos_return_order', true), '') = new.id::text then null
    else auth.uid()
  end;

  if old.status is distinct from new.status then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'status_changed', old.status::text, new.status::text, v_actor);
  end if;

  if old.tracking_code is distinct from new.tracking_code then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'tracking_changed', old.tracking_code, new.tracking_code, v_actor);
  end if;

  if old.customer_name is distinct from new.customer_name then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:customer_name', old.customer_name::text, new.customer_name::text, v_actor);
  end if;
  if old.customer_phone is distinct from new.customer_phone then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:customer_phone', old.customer_phone::text, new.customer_phone::text, v_actor);
  end if;
  if old.customer_city is distinct from new.customer_city then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:customer_city', old.customer_city::text, new.customer_city::text, v_actor);
  end if;
  if old.customer_address is distinct from new.customer_address then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:customer_address', old.customer_address::text, new.customer_address::text, v_actor);
  end if;
  if old.customer_comment is distinct from new.customer_comment then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:customer_comment', old.customer_comment::text, new.customer_comment::text, v_actor);
  end if;
  if old.payment_type is distinct from new.payment_type then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:payment_type', old.payment_type::text, new.payment_type::text, v_actor);
  end if;
  if old.delivery_method is distinct from new.delivery_method then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:delivery_method', old.delivery_method::text, new.delivery_method::text, v_actor);
  end if;
  if old.delivery_fee is distinct from new.delivery_fee then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:delivery_fee', old.delivery_fee::text, new.delivery_fee::text, v_actor);
  end if;
  if old.discount is distinct from new.discount then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:discount', old.discount::text, new.discount::text, v_actor);
  end if;
  if old.total is distinct from new.total then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (new.id, 'field:total', old.total::text, new.total::text, v_actor);
  end if;
  return new;
end;
$function$;

create or replace function public.log_order_item_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order uuid := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  v_created timestamptz;
  v_old text;
  v_new text;
begin
  select created_at into v_created from public.orders where id = v_order;
  if not found then return coalesce(new, old); end if;  -- the whole order is being deleted

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := old.product_name || coalesce(' (' || old.variant_name || ')', '')
             || ' x' || old.quantity::text || ' · ' || old.unit_price::text || ' ₾';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := new.product_name || coalesce(' (' || new.variant_name || ')', '')
             || ' x' || new.quantity::text || ' · ' || new.unit_price::text || ' ₾';
  end if;

  if tg_op = 'INSERT' then
    if v_created > now() - interval '1 minute' then return new; end if;  -- products saved together with the new order
    insert into public.order_activity(order_id, action, new_value, changed_by)
    values (v_order, 'item_added', v_new, auth.uid());
  elsif tg_op = 'DELETE' then
    insert into public.order_activity(order_id, action, old_value, changed_by)
    values (v_order, 'item_removed', v_old, auth.uid());
  elsif v_old is distinct from v_new then
    insert into public.order_activity(order_id, action, old_value, new_value, changed_by)
    values (v_order, 'item_changed', v_old, v_new, auth.uid());
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists nexo_log_order_item_activity on public.order_items;
create trigger nexo_log_order_item_activity
  after insert or update or delete on public.order_items
  for each row execute function public.log_order_item_activity();

-- 4) Re-send to OnWay: replaces the tracking code (server only) ------------------
create or replace function public.nexo_record_onway_resend(
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
  if target.delivery_method is distinct from 'onway' then
    raise exception 'Order is not an OnWay order';
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
revoke all on function public.nexo_record_onway_resend(text, uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.nexo_record_onway_resend(text, uuid, text, numeric)
  to service_role;

commit;
