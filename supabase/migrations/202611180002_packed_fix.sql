-- Fix: the "only the packed mark changed" check must ignore updated_at (another trigger
-- touches it before this one runs), otherwise a manager's mark is rejected with
-- "Only admins and operators may update orders".
begin;

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
  if (to_jsonb(new) - 'packed_at' - 'packed_by' - 'updated_at') = (to_jsonb(old) - 'packed_at' - 'packed_by' - 'updated_at') then
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

commit;
