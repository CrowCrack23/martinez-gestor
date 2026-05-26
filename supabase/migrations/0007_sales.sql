-- 0007_sales.sql
-- Ventas: clientes + órdenes (online o POS) + líneas. Al confirmar una orden
-- se genera automáticamente un inventory_movement type='salida' que descuenta
-- stock del almacén origen. Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- CUSTOMERS (opcional en cada orden — POS puede vender a "consumidor final")
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null default '',
  email      text not null default '',
  address    text not null default '',
  notes      text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_active_idx on public.customers(active);
create index if not exists customers_name_idx   on public.customers(lower(name));
create index if not exists customers_phone_idx  on public.customers(phone);

drop trigger if exists tg_customers_updated_at on public.customers;
create trigger tg_customers_updated_at
  before update on public.customers
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type order_origin as enum ('online', 'pos', 'whatsapp', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('borrador', 'confirmada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('efectivo', 'transferencia', 'tarjeta', 'mixto', 'otro');
exception when duplicate_object then null; end $$;

create sequence if not exists public.sales_order_seq;

create or replace function public.next_sales_order_code()
returns text language plpgsql as $$
declare
  n integer;
begin
  n := nextval('public.sales_order_seq');
  return 'OV-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default public.next_sales_order_code(),
  customer_id    uuid references public.customers(id) on delete set null,
  warehouse_id   uuid not null references public.warehouses(id) on delete restrict,
  origin         order_origin not null default 'pos',
  status         order_status not null default 'borrador',
  payment_method payment_method not null default 'efectivo',
  reference      text not null default '',          -- nº pedido externo (web, WhatsApp, etc.)
  notes          text not null default '',
  total_amount   numeric(12,2) not null default 0,
  created_by     uuid references public.app_users(id) on delete set null,
  confirmed_by   uuid references public.app_users(id) on delete set null,
  confirmed_at   timestamptz,
  movement_id    uuid references public.inventory_movements(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_status_idx     on public.orders(status);
create index if not exists orders_origin_idx     on public.orders(origin);
create index if not exists orders_warehouse_idx  on public.orders(warehouse_id);
create index if not exists orders_customer_idx   on public.orders(customer_id);
create index if not exists orders_created_idx    on public.orders(created_at desc);

create table if not exists public.order_lines (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  text not null references public.products(id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0),
  line_total  numeric(12,2) generated always as (quantity * unit_price) stored,
  position    integer not null default 0
);

create index if not exists order_lines_order_idx on public.order_lines(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.recalc_order_total()
returns trigger language plpgsql as $$
declare
  oid uuid := coalesce(NEW.order_id, OLD.order_id);
begin
  update public.orders
  set total_amount = coalesce((
    select sum(line_total) from public.order_lines where order_id = oid
  ), 0),
  updated_at = now()
  where id = oid;
  return null;
end $$;

drop trigger if exists tg_order_lines_recalc on public.order_lines;
create trigger tg_order_lines_recalc
  after insert or update or delete on public.order_lines
  for each row execute function public.recalc_order_total();

create or replace function public.guard_order_lines_immutable()
returns trigger language plpgsql as $$
declare
  st order_status;
  oid uuid := coalesce(NEW.order_id, OLD.order_id);
begin
  select status into st from public.orders where id = oid;
  if st in ('confirmada', 'cancelada') then
    raise exception 'No se pueden modificar líneas de una orden % (%)', oid, st;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists tg_order_lines_guard on public.order_lines;
create trigger tg_order_lines_guard
  before insert or update or delete on public.order_lines
  for each row execute function public.guard_order_lines_immutable();

drop trigger if exists tg_orders_updated_at on public.orders;
create trigger tg_orders_updated_at
  before update on public.orders
  for each row execute function public.tg_set_updated_at();

-- RLS
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_lines enable row level security;
