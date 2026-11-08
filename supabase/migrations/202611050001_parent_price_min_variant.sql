-- მთავარი პროდუქტის ფასი = მისი ვარიანტების ყველაზე დაბალი ფასი.
-- ეშვება ვარიანტის დამატებისას/ფასის ან აქტივობის შეცვლისას/წაშლისას (POS, იმპორტი, ორდერების აპი).
-- არჩევისას აქტიური ვარიანტები ითვლება; თუ აქტიური არცერთია, ყველა ვარიანტი.

create or replace function public.sync_parent_price_from_variants() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid; low numeric;
begin
  pid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  if pid is null then return null; end if;
  select coalesce(
    (select min(price) from public.product_variants where product_id = pid and active is true),
    (select min(price) from public.product_variants where product_id = pid)
  ) into low;
  if low is not null then
    update public.products set price = low where id = pid and price is distinct from low;
  end if;
  return null;
end $$;

revoke all on function public.sync_parent_price_from_variants() from public, anon, authenticated;

drop trigger if exists trg_sync_parent_price on public.product_variants;
create trigger trg_sync_parent_price
after insert or delete or update of price, active, product_id on public.product_variants
for each row execute function public.sync_parent_price_from_variants();

-- ერთჯერადი გასწორება არსებულ პროდუქტებზე:
update public.products p
set price = m.low
from (
  select product_id,
         coalesce(min(price) filter (where active is true), min(price)) as low
  from public.product_variants group by product_id
) m
where m.product_id = p.id and p.price is distinct from m.low;

-- უკან დასაბრუნებლად (მხოლოდ ავტომატური განახლების გამორთვა):
-- drop trigger if exists trg_sync_parent_price on public.product_variants;
-- drop function if exists public.sync_parent_price_from_variants();
