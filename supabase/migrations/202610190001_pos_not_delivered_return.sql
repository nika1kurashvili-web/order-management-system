-- POS return whose reason is "არ ჩაბარდა" (not delivered) -> the matching OnWay order
-- on orders.nexo.ge becomes "returned" (დაბრუნდა).
-- Link: pos_returns.sale_id -> pos_sales.tracking_code -> orders.tracking_code.
-- Only returns whose pos_returns.reason starts with "არ ჩაბარდა" are considered, and
-- only orders currently "return_pending" or "shipping" are changed. A failure here
-- never blocks the POS return: it is recorded in nexo_pos_return_log instead.
begin;

create table if not exists public.nexo_pos_return_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  return_id uuid,
  tracking text,
  result text not null
);
alter table public.nexo_pos_return_log enable row level security;
-- no policies: only the database owner / service role can read it (SQL Editor).

-- Same function as before plus ONE extra branch: a status change to "returned" made
-- from inside the POS-return trigger (trigger depth > 1, transaction-local marker).
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

  -- POS "not delivered" return: only shipping/return_pending -> returned, and only
  -- when this UPDATE runs inside the POS-return trigger (a plain client UPDATE has depth 1).
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
        where btrim(tracking_code) = trk and delivery_method = 'onway';
      if matches = 0 then outcome := 'not_found';
      elsif matches > 1 then outcome := 'ambiguous';
      else
        select * into target from public.orders
          where btrim(tracking_code) = trk and delivery_method = 'onway' for update;
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
    -- Never block the POS return. The error text is kept for diagnosis.
    begin
      insert into public.nexo_pos_return_log (return_id, tracking, result)
        values (new.id, trk, 'error: ' || sqlerrm);
    exception when others then null;
    end;
  end;
  return null;
end $$;

drop trigger if exists nexo_pos_return_mark_returned on public.pos_returns;
create trigger nexo_pos_return_mark_returned
  after insert on public.pos_returns
  for each row when (new.reason ilike 'არ ჩაბარდა%')
  execute function public.nexo_pos_return_mark_returned();

-- Also when the reason is filled in / changed after the row was created.
drop trigger if exists nexo_pos_return_mark_returned_upd on public.pos_returns;
create trigger nexo_pos_return_mark_returned_upd
  after update of reason on public.pos_returns
  for each row when (new.reason ilike 'არ ჩაბარდა%' and old.reason is distinct from new.reason)
  execute function public.nexo_pos_return_mark_returned();

commit;
