-- Stock comes from the POS. Whenever a stock value is written or CHANGED:
--   stock = 0 (or less) -> the product / variant becomes inactive
--   stock > 0           -> it becomes active again
-- Products that have variants follow their variants: active while at least one
-- variant is active. Nothing runs for rows whose stock did not change, so manual
-- activation/deactivation is only overridden by the next real stock change.
begin;

-- Products WITHOUT variants: their own stock decides.
create or replace function public.nexo_product_stock_active()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.stock is not null
     and (tg_op = 'INSERT' or new.stock is distinct from old.stock)
     and not exists (select 1 from public.product_variants v where v.product_id = new.id) then
    new.active := new.stock > 0;
  end if;
  return new;
end $$;

drop trigger if exists nexo_product_stock_active on public.products;
create trigger nexo_product_stock_active
  before insert or update of stock on public.products
  for each row execute function public.nexo_product_stock_active();

-- Variants: their own stock decides.
create or replace function public.nexo_variant_stock_active()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.stock is not null and (tg_op = 'INSERT' or new.stock is distinct from old.stock) then
    new.active := new.stock > 0;
  end if;
  return new;
end $$;

drop trigger if exists nexo_variant_stock_active on public.product_variants;
create trigger nexo_variant_stock_active
  before insert or update of stock on public.product_variants
  for each row execute function public.nexo_variant_stock_active();

-- After a variant's stock changed, the parent product is active iff any variant is active.
create or replace function public.nexo_parent_product_active()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare any_active boolean;
begin
  if new.stock is null or not (tg_op = 'INSERT' or new.stock is distinct from old.stock) then
    return null;
  end if;
  select exists (select 1 from public.product_variants v where v.product_id = new.product_id and v.active)
    into any_active;
  update public.products set active = any_active
    where id = new.product_id and active is distinct from any_active;
  return null;
end $$;

drop trigger if exists nexo_parent_product_active on public.product_variants;
create trigger nexo_parent_product_active
  after insert or update of stock on public.product_variants
  for each row execute function public.nexo_parent_product_active();

commit;
