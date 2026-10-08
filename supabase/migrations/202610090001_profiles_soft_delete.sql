-- Employee "delete" keeps the profile row (names in order history/reports stay intact)
-- but removes the person's access. The login itself is removed by the server route.
alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at);
