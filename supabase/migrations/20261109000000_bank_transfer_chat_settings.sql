-- 1) Bank-transfer orders: an order now starts as "waiting for payment"
--    (status pending, payment_status pending). An admin confirms the transfer,
--    which moves it to confirmed/paid and creates the delivery.
alter table public.orders alter column payment_method set default 'bank';
alter table public.orders alter column payment_status set default 'pending';
alter table public.orders alter column status set default 'pending';
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
create index if not exists orders_status_idx on public.orders (status, created_at desc);

-- 2) Account deletion: accounts are anonymized, not hard-deleted, because
--    orders must keep pointing at a buyer/seller.
alter table public.users add column if not exists deleted_at timestamptz;

-- 3) Chat between a buyer and the seller about one product.
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  buyer_id        uuid not null references public.users (id) on delete cascade,
  seller_id       uuid not null references public.users (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  buyer_read_at   timestamptz not null default now(),
  seller_read_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (product_id, buyer_id)
);
create index if not exists conversations_buyer_idx on public.conversations (buyer_id, last_message_at desc);
create index if not exists conversations_seller_idx on public.conversations (seller_id, last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.users (id) on delete cascade,
  body            varchar(1000) not null,
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- 4) Safety (App Store guideline 1.2): users can block and report.
create table if not exists public.blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users (id) on delete cascade,
  target_type text not null check (target_type in ('product', 'user', 'message')),
  target_id   uuid not null,
  reason      varchar(500),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.blocks        enable row level security;
alter table public.reports       enable row level security;

-- Backend role access (the role exists on Supabase; skip quietly elsewhere).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'newexit_api') then
    grant select, insert, update, delete on public.conversations, public.messages,
      public.blocks, public.reports to newexit_api;
    if not exists (select 1 from pg_policies where tablename = 'conversations' and policyname = 'backend_all') then
      create policy backend_all on public.conversations for all to newexit_api using (true) with check (true);
      create policy backend_all on public.messages      for all to newexit_api using (true) with check (true);
      create policy backend_all on public.blocks        for all to newexit_api using (true) with check (true);
      create policy backend_all on public.reports       for all to newexit_api using (true) with check (true);
    end if;
  end if;
end $$;
