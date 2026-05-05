create table if not exists public.app_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
alter table public.accounts enable row level security;
alter table public.account_run_results enable row level security;

drop policy if exists "Admins can read app admins" on public.app_admins;
drop policy if exists "Admins can read accounts" on public.accounts;
drop policy if exists "Admins can insert accounts" on public.accounts;
drop policy if exists "Admins can update accounts" on public.accounts;
drop policy if exists "Admins can delete accounts" on public.accounts;
drop policy if exists "Admins can read run results" on public.account_run_results;
drop policy if exists "Admins can delete run results" on public.account_run_results;

create policy "Admins can read app admins"
on public.app_admins
for select
to authenticated
using (user_id = auth.uid());

create policy "Admins can read accounts"
on public.accounts
for select
to authenticated
using (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);

create policy "Admins can insert accounts"
on public.accounts
for insert
to authenticated
with check (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);

create policy "Admins can update accounts"
on public.accounts
for update
to authenticated
using (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
)
with check (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);

create policy "Admins can delete accounts"
on public.accounts
for delete
to authenticated
using (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);

create policy "Admins can read run results"
on public.account_run_results
for select
to authenticated
using (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);

create policy "Admins can delete run results"
on public.account_run_results
for delete
to authenticated
using (
    exists (
        select 1 from public.app_admins
        where app_admins.user_id = auth.uid()
    )
);
