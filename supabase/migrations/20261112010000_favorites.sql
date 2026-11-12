-- Saved ("хадгалсан") products: a heart on a product card.
create table if not exists public.favorites (
  user_id    uuid not null references public.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);

alter table public.favorites enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'newexit_api') then
    grant select, insert, update, delete on public.favorites to newexit_api;
    if not exists (select 1 from pg_policies where tablename = 'favorites' and policyname = 'backend_all') then
      create policy backend_all on public.favorites for all to newexit_api using (true) with check (true);
    end if;
  end if;
end $$;

-- products.favorite_count follows the table.
update public.products p set favorite_count = (select count(*) from public.favorites f where f.product_id = p.id);
