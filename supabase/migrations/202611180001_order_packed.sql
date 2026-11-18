-- "გამზადებულია": the warehouse marks an order as packed.
-- Admin / manager (warehouse) / operator (own orders only) may set or clear the mark through
-- nexo_set_packed(). Nothing else on the order can be changed through it. Every change is
-- written to the order history ("packed" / "unpacked").
begin;

alter table public.orders add column if not exists packed_at timestamptz;
alter table public.orders add column if not exists packed_by uuid;

-- Operator protection trigger: additionally let through an update that changes ONLY the packed
-- columns (row access is still decided by RLS / by nexo_set_packed itself).
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

  -- only the "packed" mark changed
  if (to_jsonb(new) - 'packed_at' - 'packed_by') = (to_jsonb(old) - 'packed_at' - 'packed_by') then
    return new;
  end if;

  if public.nexo_active_role() is distinct from 'operator' then
    raise exception 'Only admins and operators may update orders';
  end if;

  if new.id is distinct from old.id
    or new.order_number is distinct from old.order_number
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then raise exception 'Operator cannot change the order id, number, creator or date'; end if;

  if old.created_by = auth.uid() and now() - old.created_at <= interval '24 hours' then
    return new;
  end if;

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

create or replace function public.nexo_set_packed(p_order_id uuid, p_packed boolean)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  r text;
  target public.orders%rowtype;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  r := public.nexo_active_role();
  if r is null or r not in ('admin', 'operator', 'manager') then
    raise exception 'Order access denied';
  end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if r = 'operator' and target.created_by is distinct from actor then
    raise exception 'Order access denied';
  end if;

  if (target.packed_at is not null) is not distinct from p_packed then
    return p_packed;  -- nothing to change
  end if;

  update public.orders
    set packed_at = case when p_packed then now() else null end,
        packed_by = case when p_packed then actor else null end
    where id = p_order_id;

  insert into public.order_activity (order_id, action, changed_by)
    values (p_order_id, case when p_packed then 'packed' else 'unpacked' end, actor);
  return p_packed;
end $$;
revoke all on function public.nexo_set_packed(uuid, boolean) from public, anon;
grant execute on function public.nexo_set_packed(uuid, boolean) to authenticated;

commit;

-- Rollback (hides nothing already stored):
-- drop function if exists public.nexo_set_packed(uuid, boolean);
-- (the trigger function keeps working as before; the two columns can stay)
