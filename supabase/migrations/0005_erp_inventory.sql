-- 0005_erp_inventory.sql
-- ERP foundation: multi-user auth, warehouses, stock per location, inventory movements.
-- Idempotent. Apply in Supabase SQL Editor.
--
-- Numbering continues from martinez-global migrations (0001..0004 created
-- products/combos/categories/stores). This migration lives in martinez-gestor
-- because the ERP app owns these new entities. Keep both folders in sync if
-- you ever consolidate.

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTH: app_users, roles, user_roles
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,            -- format: "<saltHex>:<hashHex>" (scrypt)
  full_name     text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.roles (
  id          text primary key,           -- e.g. 'admin', 'almacenero'
  name        text not null,
  description text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id    uuid not null references public.app_users(id) on delete cascade,
  role_id    text not null references public.roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_roles_role_idx on public.user_roles(role_id);

-- Seed roles
insert into public.roles (id, name, description) values
  ('admin',      'Administrador',     'Acceso total al sistema'),
  ('almacenero', 'Almacenero',        'Gestiona stock y movimientos de inventario'),
  ('vendedor',   'Vendedor',          'Registra ventas y consulta stock'),
  ('contador',   'Contador',          'Acceso a contabilidad y reportes'),
  ('rrhh',       'Recursos Humanos',  'Gestiona empleados y nómina')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- WAREHOUSES
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type warehouse_type as enum (
    'almacen_central',
    'tienda_fisica',
    'tienda_online',
    'centro_elaboracion'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                       -- short identifier, e.g. 'ALM-CENTRAL'
  name        text not null,
  type        warehouse_type not null default 'almacen_central',
  store_slug  text references public.stores(slug) on update cascade on delete set null,
  address     text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists warehouses_active_idx on public.warehouses(active);
create index if not exists warehouses_type_idx   on public.warehouses(type);

-- Seed one warehouse per existing store (online tienda) so today's product.stock
-- can be migrated without losing data.
insert into public.warehouses (code, name, type, store_slug, address)
select
  'TIENDA-' || upper(s.slug),
  'Tienda online ' || s.label,
  'tienda_online'::warehouse_type,
  s.slug,
  ''
from public.stores s
on conflict (code) do nothing;

-- A central physical warehouse — useful even if no store maps to it.
insert into public.warehouses (code, name, type, address)
values ('ALM-CENTRAL', 'Almacén central', 'almacen_central', '')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- STOCK LOCATIONS  (product × warehouse → quantity)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.stock_locations (
  product_id   text not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity     integer not null default 0 check (quantity >= 0),
  min_stock    integer not null default 0 check (min_stock >= 0),
  max_stock    integer,
  updated_at   timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);

create index if not exists stock_locations_warehouse_idx on public.stock_locations(warehouse_id);
create index if not exists stock_locations_low_idx       on public.stock_locations(product_id) where quantity <= min_stock;

-- Backfill: copy current products.stock into the matching tienda-online warehouse.
-- Safe to run repeatedly thanks to ON CONFLICT.
insert into public.stock_locations (product_id, warehouse_id, quantity)
select p.id, w.id, coalesce(p.stock, 0)
from public.products p
join public.warehouses w
  on w.store_slug = p.store and w.type = 'tienda_online'
on conflict (product_id, warehouse_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTORY MOVEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type inventory_movement_type as enum (
    'entrada',        -- recepción de compra o ingreso manual
    'salida',         -- venta o salida manual
    'transferencia',  -- entre dos almacenes
    'ajuste',         -- corrección de inventario (positiva o negativa)
    'merma'           -- pérdida / daño
  );
exception when duplicate_object then null; end $$;

create table if not exists public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  type           inventory_movement_type not null,
  warehouse_from uuid references public.warehouses(id) on delete restrict,
  warehouse_to   uuid references public.warehouses(id) on delete restrict,
  reference_type text not null default 'manual',   -- 'manual' | 'compra' | 'venta' | 'produccion' | ...
  reference_id   text,
  user_id        uuid references public.app_users(id) on delete set null,
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  -- A 'transferencia' needs both sides; everything else needs at least one.
  constraint movements_endpoints check (
    case type
      when 'transferencia' then warehouse_from is not null and warehouse_to is not null
      when 'entrada'       then warehouse_to is not null
      when 'salida'        then warehouse_from is not null
      when 'merma'         then warehouse_from is not null
      when 'ajuste'        then warehouse_to is not null      -- el signo va en la cantidad de la línea
    end
  )
);

create index if not exists movements_created_idx on public.inventory_movements(created_at desc);
create index if not exists movements_type_idx    on public.inventory_movements(type);

create table if not exists public.inventory_movement_lines (
  id          uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.inventory_movements(id) on delete cascade,
  product_id  text not null references public.products(id) on delete restrict,
  quantity    integer not null check (quantity <> 0),  -- ajuste permite negativos; otros usan positivo
  unit_cost   numeric(10,2)
);

create index if not exists movement_lines_movement_idx on public.inventory_movement_lines(movement_id);
create index if not exists movement_lines_product_idx  on public.inventory_movement_lines(product_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: apply movement lines onto stock_locations
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Strategy: when a line is inserted, look up its movement to know type +
-- source/destination warehouses, then upsert stock_locations accordingly.
-- For 'ajuste' the line's quantity carries the sign (positive or negative).
-- For everything else the quantity is positive and the trigger picks the sign.

create or replace function public.apply_inventory_movement_line()
returns trigger
language plpgsql
as $$
declare
  m public.inventory_movements%rowtype;
begin
  select * into m from public.inventory_movements where id = NEW.movement_id;
  if not found then
    raise exception 'inventory_movement % no existe', NEW.movement_id;
  end if;

  if m.type = 'entrada' then
    perform public._stock_add(NEW.product_id, m.warehouse_to, NEW.quantity);
  elsif m.type = 'salida' or m.type = 'merma' then
    perform public._stock_add(NEW.product_id, m.warehouse_from, -NEW.quantity);
  elsif m.type = 'transferencia' then
    perform public._stock_add(NEW.product_id, m.warehouse_from, -NEW.quantity);
    perform public._stock_add(NEW.product_id, m.warehouse_to,    NEW.quantity);
  elsif m.type = 'ajuste' then
    -- línea trae el delta con signo; warehouse_to es el almacén ajustado
    perform public._stock_add(NEW.product_id, m.warehouse_to, NEW.quantity);
  end if;

  return NEW;
end $$;

create or replace function public._stock_add(p_product text, p_warehouse uuid, p_delta integer)
returns void
language plpgsql
as $$
begin
  insert into public.stock_locations (product_id, warehouse_id, quantity, updated_at)
  values (p_product, p_warehouse, greatest(p_delta, 0), now())
  on conflict (product_id, warehouse_id) do update
    set quantity = public.stock_locations.quantity + p_delta,
        updated_at = now();

  -- Guard rail: nunca dejar stock negativo (check de tabla también lo impide).
  if (select quantity from public.stock_locations
        where product_id = p_product and warehouse_id = p_warehouse) < 0 then
    raise exception 'Stock insuficiente para producto % en almacén %', p_product, p_warehouse;
  end if;
end $$;

drop trigger if exists tg_apply_inventory_movement_line on public.inventory_movement_lines;
create trigger tg_apply_inventory_movement_line
  after insert on public.inventory_movement_lines
  for each row execute function public.apply_inventory_movement_line();

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers (reuse pattern from 0001_init.sql)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end $$;

drop trigger if exists tg_app_users_updated_at on public.app_users;
create trigger tg_app_users_updated_at
  before update on public.app_users
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_warehouses_updated_at on public.warehouses;
create trigger tg_warehouses_updated_at
  before update on public.warehouses
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
-- All ERP tables: deny by default. The gestor app uses the service_role key
-- which bypasses RLS, so this is just defense in depth against anon/auth keys.

alter table public.app_users               enable row level security;
alter table public.roles                   enable row level security;
alter table public.user_roles              enable row level security;
alter table public.warehouses              enable row level security;
alter table public.stock_locations         enable row level security;
alter table public.inventory_movements     enable row level security;
alter table public.inventory_movement_lines enable row level security;
