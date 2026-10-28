-- POS "არ ჩაბარდა" returns failed since 2026-10-27 with:
--   order_activity_changed_by_fkey violated
-- because log_order_activity() wrote auth.uid() (the POS user, who is not in the
-- referenced table) into order_activity.changed_by. Inside the POS-return trigger
-- (transaction marker nexo.pos_return_order = this order) the actor is now NULL,
-- exactly like the service-role/webhook updates that already work. Everything else
-- in the function is unchanged.
begin;

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

  if old.customer_name is distinct from new.customer_name
     or old.customer_phone is distinct from new.customer_phone
     or old.customer_address is distinct from new.customer_address
     or old.customer_comment is distinct from new.customer_comment
     or old.delivery_fee is distinct from new.delivery_fee
     or old.discount is distinct from new.discount
     or old.total is distinct from new.total then
    insert into public.order_activity(order_id, action, changed_by)
    values (new.id, 'order_updated', v_actor);
  end if;
  return new;
end;
$function$;

commit;
