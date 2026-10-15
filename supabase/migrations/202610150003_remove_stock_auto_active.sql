-- Removes the stock -> active triggers. `active` is shared with the POS and must not
-- be changed by the site. Safe to run even if 202610150002 was never applied.
begin;
drop trigger if exists nexo_product_stock_active on public.products;
drop trigger if exists nexo_variant_stock_active on public.product_variants;
drop trigger if exists nexo_parent_product_active on public.product_variants;
drop function if exists public.nexo_product_stock_active();
drop function if exists public.nexo_variant_stock_active();
drop function if exists public.nexo_parent_product_active();
commit;
