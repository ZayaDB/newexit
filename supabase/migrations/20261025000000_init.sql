-- NEW EXIT initial schema (ported from the MongoDB models)
-- The Express backend connects directly to Postgres, so every table has RLS
-- enabled with no policies: the public anon/publishable key can't read or
-- write anything, only the backend (postgres role) can.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- users -------------------------------------------------------------------
create table public.users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,
  phone       text unique,
  password    text,
  role        text not null default 'buyer'
              check (role in ('buyer', 'seller', 'mover', 'admin')),
  is_verified boolean not null default false,
  avatar      text,
  location    text default 'Сөүл, Солонгос',
  points      integer not null default 4580,
  badge       text,
  language    text not null default 'mn' check (language in ('mn', 'kr', 'en')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- categories --------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name_mn    text not null,
  name_en    text,
  icon       text,
  color      text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- products ----------------------------------------------------------------
create table public.products (
  id                uuid primary key default gen_random_uuid(),
  seller_id         uuid not null references public.users (id) on delete cascade,
  category_id       uuid not null references public.categories (id),
  title             varchar(100) not null,
  short_description varchar(200),
  description       varchar(1000),
  price             integer not null check (price >= 0),
  currency          text not null default 'KRW',
  quantity          integer not null default 1 check (quantity >= 1),
  images            text[] not null default '{}',
  location          text not null,
  condition         text not null default 'used'
                    check (condition in ('new', 'used', 'good', 'fair')),
  badges            text[] not null default '{}',
  dimensions        jsonb,
  delivery_option   text not null default 'delivery'
                    check (delivery_option in ('pickup', 'delivery', 'both')),
  has_warranty      boolean not null default false,
  is_returnable     boolean not null default false,
  is_featured       boolean not null default false,
  is_free           boolean not null default false,
  view_count        integer not null default 0,
  favorite_count    integer not null default 0,
  status            text not null default 'active'
                    check (status in ('draft', 'active', 'sold', 'hidden')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index products_seller_id_idx on public.products (seller_id);
create index products_category_id_idx on public.products (category_id);
create index products_status_created_idx on public.products (status, created_at desc);

-- orders ------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  buyer_id         uuid not null references public.users (id),
  seller_id        uuid not null references public.users (id),
  product_id       uuid not null references public.products (id),
  item_price       integer not null,
  delivery_fee     integer not null default 30000,
  assembly_fee     integer not null default 20000,
  points_used      integer not null default 0,
  total_amount     integer not null,
  currency         text not null default 'KRW',
  payment_method   text not null default 'card'
                   check (payment_method in ('card', 'zpay', 'points', 'bank')),
  payment_status   text not null default 'pending'
                   check (payment_status in ('pending', 'paid', 'refunded', 'failed')),
  status           text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'preparing', 'shipping', 'delivered', 'cancelled')),
  delivery_address text,
  include_assembly boolean not null default true,
  include_delivery boolean not null default true,
  status_history   jsonb not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index orders_buyer_id_idx on public.orders (buyer_id);
create index orders_seller_id_idx on public.orders (seller_id);
create index orders_product_id_idx on public.orders (product_id);

-- deliveries --------------------------------------------------------------
create table public.deliveries (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  tracking_number       text not null unique,
  route                 text default 'Солонгос -> Монгол',
  origin                text default 'Сөүл, Солонгос',
  destination           text default 'Улаанбаатар, Монгол',
  company               text default 'NEW EXIT Delivery',
  departure_date        timestamptz,
  estimated_arrival     text,
  current_status        text not null default 'confirmed'
                        check (current_status in ('confirmed', 'preparing', 'out_for_delivery', 'delivered')),
  timeline              jsonb not null default '[]',
  driver                jsonb,
  eta                   text,
  live_tracking_enabled boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index deliveries_order_id_idx on public.deliveries (order_id);

-- updated_at triggers -----------------------------------------------------
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger deliveries_updated_at before update on public.deliveries
  for each row execute function public.set_updated_at();

-- lock tables to the backend only -----------------------------------------
alter table public.users      enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;
alter table public.deliveries enable row level security;
