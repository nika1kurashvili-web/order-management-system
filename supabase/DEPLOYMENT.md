# Delivery methods, manager role and permanent order deletion

## Required deployment steps

1. Back up the database using your usual Supabase backup process.
2. Run `migrations/202609250001_delivery_manager_permissions.sql` once, in the
   Supabase SQL Editor, as the database owner. The script uses a transaction and
   stops if the three supplied order-child cascade constraints are not present.
   It does not recreate `delivery_method` or `delivery_fee`, change foreign keys,
   or delete any data. This migration has **not** been executed by Codex.
3. In Vercel, add `SUPABASE_SERVICE_ROLE_KEY` using the Supabase project's server
   service-role key. Do **not** prefix it with `NEXT_PUBLIC_`. Keep the existing
   proxy/OnWay variables unchanged. Do not paste secrets into source files.
4. Build and deploy the application, then assign `manager` through Employees if
   desired. Do not assign managers until the SQL migration has succeeded.

The new server key is used only in the authenticated OnWay route to call
`nexo_record_onway_result`. This RPC saves the initial tracking code, shipping
status and valid courier fee together. It cannot be called by anon/authenticated
browser roles, rechecks the actor's active admin/operator role and order access,
and refuses to overwrite an order that already has tracking. The service key is
never passed to the proxy or browser. Automatic courier-result activity is logged
as a system action; the original order creator sent to OnWay is unchanged.

Without the key or migration, the route retains a caller-authorized database
fallback. Admins can save all three fields. An operator's existing trigger may
reject the fee: tracking/status are saved separately and a warning asks an admin
to correct the fee. **Only database writes are retried, never the shipment.**
If tracking cannot be saved, the response includes it and explicitly warns not
to resend; reconcile it manually in Nexo/OnWay.

## Permissions and relationships

- Existing admin/operator permissive RLS policies remain in place. New restrictive
  policies deny manager/inactive-user INSERT, UPDATE and DELETE on orders, items,
  status history, activity, products, variants and profiles. RLS is enabled on
  these tables explicitly. Existing admin-only product/profile policies still
  apply to operators.
- Active managers can read all orders and products. Existing child SELECT policies
  expose only rows whose parent order is readable. A profile SELECT policy lets
  managers read the profile rows used in creator/history/report joins; this is
  row-level access to profile fields, not a column-only name grant. Employees UI
  and all profile mutations remain admin-only.
- The operator update trigger additionally protects `delivery_method`. Manual
  delivery-fee changes remain admin-only. Operator order creation is unchanged.
- Order DELETE is additionally restricted to `is_admin()`. One parent DELETE
  cascades through `order_items_order_id_fkey`,
  `order_status_history_order_id_fkey`, and `order_activity_order_id_fkey`.
  Products and variants are not deleted or changed. Deletion never calls OnWay.
- The migration trusts the supplied live schema export for the other existing
  policies/functions. Additional tables or custom SECURITY DEFINER write RPCs
  outside that export need their own review before granting manager access.

## Checks before production

Use disposable test records in a staging database to verify admin/operator/manager
RLS and the cascades. Do not test with production orders or create real courier
shipments for verification. Verify the service-only RPC is denied when using an
authenticated browser JWT. Check the same order in a manager and operator session:
the manager can view/export, while the operator retains their own-order scope.

The existing tracking guard is retained. It does not claim to prevent simultaneous
initial submissions from separate clients before either receives tracking; the
new row lock protects result persistence, not external courier idempotency.
