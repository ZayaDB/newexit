-- 1) Delivery workflow run by delivery drivers (role 'mover'):
--    confirmed (paid, waiting for a driver) -> picked_up (driver has the item)
--    -> in_transit (handed to the parcel/cargo company) -> delivered.
alter table public.deliveries drop constraint if exists deliveries_current_status_check;
alter table public.deliveries add constraint deliveries_current_status_check
  check (current_status in ('confirmed', 'picked_up', 'in_transit', 'preparing', 'out_for_delivery', 'delivered'));
alter table public.deliveries add column if not exists driver_id uuid references public.users (id) on delete set null;
alter table public.deliveries add column if not exists carrier text;
alter table public.deliveries add column if not exists carrier_tracking text;
alter table public.deliveries add column if not exists picked_up_at timestamptz;
alter table public.deliveries add column if not exists shipped_at timestamptz;
alter table public.deliveries add column if not exists delivered_at timestamptz;
create index if not exists deliveries_driver_idx on public.deliveries (driver_id, current_status);
create index if not exists deliveries_status_idx on public.deliveries (current_status, created_at);

-- Existing deliveries get the new 4-step timeline.
update public.deliveries set timeline = jsonb_build_array(
    jsonb_build_object('status', 'confirmed', 'labelMn', 'Төлбөр баталгаажсан', 'timestamp', created_at, 'completed', true),
    jsonb_build_object('status', 'picked_up', 'labelMn', 'Жолооч бараа хүлээн авсан', 'timestamp', null, 'completed', false),
    jsonb_build_object('status', 'in_transit', 'labelMn', 'Илгээмжид өгсөн', 'timestamp', null, 'completed', false),
    jsonb_build_object('status', 'delivered', 'labelMn', 'Хүргэгдсэн', 'timestamp', null, 'completed', false)
  )
  where current_status = 'confirmed';

-- 2) Notifications: in-app list + Expo push tokens.
create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  platform   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  type       text not null,
  title      varchar(120) not null,
  body       varchar(300) not null default '',
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- 3) Reviews: the buyer rates the seller once per completed order.
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.orders (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  seller_id   uuid not null references public.users (id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     varchar(500),
  created_at  timestamptz not null default now()
);
create index if not exists reviews_seller_idx on public.reviews (seller_id, created_at desc);

-- 4) Photos in chat.
alter table public.messages add column if not exists image_url text;

-- 5) Admin tools: suspend accounts, resolve reports.
alter table public.users add column if not exists suspended_at timestamptz;
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references public.users (id) on delete set null;
alter table public.reports add column if not exists action text;

alter table public.push_tokens   enable row level security;
alter table public.notifications enable row level security;
alter table public.reviews       enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'newexit_api') then
    grant select, insert, update, delete on public.push_tokens, public.notifications, public.reviews to newexit_api;
    if not exists (select 1 from pg_policies where tablename = 'push_tokens' and policyname = 'backend_all') then
      create policy backend_all on public.push_tokens   for all to newexit_api using (true) with check (true);
      create policy backend_all on public.notifications for all to newexit_api using (true) with check (true);
      create policy backend_all on public.reviews       for all to newexit_api using (true) with check (true);
    end if;
  end if;
end $$;
