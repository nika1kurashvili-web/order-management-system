# Productivity Upgrade

1. Supabase → SQL Editor → New query.
2. Run `supabase/productivity_upgrade.sql` once.
3. Replace the included app files in your project.
4. Commit → Push origin.
5. Wait for Vercel Ready and hard-refresh.

Included:
- Quick status change on Dashboard
- Tracking edit on Dashboard
- Employee filter
- Status quick filters
- Phone copy
- Newest/oldest sorting
- 50 orders/page pagination
- Excel export
- Order activity/history with employee + timestamp
- Existing permanent sidebar and Admin-only Analytics preserved

Note: Excel export is an on-demand operational backup. For unattended scheduled backups, use Supabase's project/database backup feature appropriate to your plan; do not rely on browser Excel files as the only database backup.
