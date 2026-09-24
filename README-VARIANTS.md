# Product Variants Upgrade

1. Supabase → SQL Editor → New query.
2. Run `supabase/product_variants.sql` ONCE.
3. Replace the included app/lib files in your project.
4. Commit → Push origin → wait for Vercel Ready → Ctrl+F5.

How it works:
- Product without variants works exactly as before.
- Admin can open a product and add variants (Honda, Toyota, Black, XL, etc.).
- Every variant has its own optional SKU/code, price, active/inactive state.
- When creating an order, if the selected product has variants, variant selection becomes required.
- Order saves both the base product and the selected variant.
- Existing old orders remain valid; their variant is simply blank.
- Order details and Excel export include the variant.
