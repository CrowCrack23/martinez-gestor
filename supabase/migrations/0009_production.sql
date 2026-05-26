-- 0009_production.sql
-- Centros de elaboración: recetas (BOM) y órdenes de producción.
-- Al confirmar una orden, se genera una salida (consumo de insumos) y una
-- entrada (producto terminado) en el almacén indicado.
-- Idempotente.

create table if not exists public.bills_of_materials (
  id          uuid primary key default gen_random_uuid(),
  product_id  text not null references public.products(id) on delete restrict,
  name        text not null,                       -- ej. "Pizza de queso 30cm"
  yield       numeric(10,2) not null default 1 check (yield > 0),
  notes       text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists boms_product_idx on public.bills_of_materials(product_id);

create table if not exists public.bom_components (
  id                   uuid primary key default gen_random_uuid(),
  bom_id               uuid not null references public.bills_of_materials(id) on delete cascade,
  component_product_id text not null references public.products(id) on delete restrict,
  quantity_per_unit    numeric(12,4) not null check (quantity_per_unit > 0),
  position             integer not null default 0
);

create index if not exists bom_components_bom_idx on public.bom_components(bom_id);

do $$ begin
  create type production_status as enum ('borrador', 'producida', 'cancelada');
exception when duplicate_object then null; end $$;

create sequence if not exists public.production_order_seq;
create or replace function public.next_production_order_code()
returns text language plpgsql as $$
declare n integer;
begin
  n := nextval('public.production_order_seq');
  return 'PROD-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

create table if not exists public.production_orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default public.next_production_order_code(),
  bom_id          uuid not null references public.bills_of_materials(id) on delete restrict,
  warehouse_id    uuid not null references public.warehouses(id) on delete restrict,
  quantity        numeric(10,2) not null check (quantity > 0),  -- nº de "yields" a producir
  status          production_status not null default 'borrador',
  notes           text not null default '',
  created_by      uuid references public.app_users(id) on delete set null,
  produced_by     uuid references public.app_users(id) on delete set null,
  produced_at     timestamptz,
  movement_in_id  uuid references public.inventory_movements(id) on delete set null,
  movement_out_id uuid references public.inventory_movements(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists production_status_idx on public.production_orders(status);
create index if not exists production_created_idx on public.production_orders(created_at desc);

drop trigger if exists tg_boms_updated_at on public.bills_of_materials;
create trigger tg_boms_updated_at before update on public.bills_of_materials
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_production_orders_updated_at on public.production_orders;
create trigger tg_production_orders_updated_at before update on public.production_orders
  for each row execute function public.tg_set_updated_at();

alter table public.bills_of_materials enable row level security;
alter table public.bom_components     enable row level security;
alter table public.production_orders  enable row level security;
