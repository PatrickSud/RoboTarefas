create table if not exists public.accounts (
    id uuid primary key default gen_random_uuid(),
    local_key text,
    name text not null,
    phone text not null,
    password text not null,
    platform text not null,
    whatsapp_phone text,
    email text,
    receives_whatsapp boolean not null default true,
    active boolean not null default true,
    test_mode boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.accounts
    add column if not exists local_key text;

alter table public.accounts
    add column if not exists deposit_entries jsonb not null default '[]'::jsonb;

create table if not exists public.account_run_results (
    id uuid primary key default gen_random_uuid(),
    account_id uuid references public.accounts(id) on delete set null,
    account_name text not null,
    platform text,
    phone text,
    status text not null,
    tasks_completed integer not null default 0,
    balance text,
    error_message text,
    screenshot_path text,
    executed_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create index if not exists idx_accounts_active on public.accounts(active);
create index if not exists idx_accounts_test_mode on public.accounts(test_mode);
create unique index if not exists idx_accounts_local_key_unique on public.accounts(local_key);
create index if not exists idx_account_run_results_account_id on public.account_run_results(account_id);
create index if not exists idx_account_run_results_executed_at on public.account_run_results(executed_at desc);
