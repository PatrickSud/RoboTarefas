alter table public.accounts add column if not exists sort_order integer;

update public.accounts
set sort_order = sub.rn
from (
    select id, row_number() over (order by created_at) as rn
    from public.accounts
) sub
where public.accounts.id = sub.id and public.accounts.sort_order is null;
