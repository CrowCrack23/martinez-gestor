-- 0006_purchases.sql
-- Compras + Proveedores. Una orden de compra en estado 'borrador' permite
-- editarse libremente; al pasar a 'recibida' se genera automáticamente un
-- inventory_movement type='entrada' que aumenta el stock en el almacén destino.
-- Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPPLIERS
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text not null default '',
  phone        text not null default '',
  email        text not null default '',
  tax_id       text not null default '',         -- NIT / RUC / cédula jurídica
  address      text not null default '',
  notes        text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists suppliers_active_idx on public.suppliers(active);
create index if not exists suppliers_name_idx   on public.suppliers(lower(name));

-- ─────────────────────────────────────────────────────────────────────────────
-- PURCHASE ORDERS
-- ─────────────────────────────────────────────────────────────────────────────

do $$ begin
  create type purchase_order_status as enum ('borrador', 'recibida', 'cancelada');
exception when duplicate_object then null; end $$;

-- Secuencia anual para códigos OC-YYYY-NNNN
create sequence if not exists public.purchase_order_seq;

create or replace function public.next_purchase_order_code()
returns text language plpgsql as $$
declare
  n integer;
begin
  n := nextval('public.purchase_order_seq');
  return 'OC-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

create table if not exists public.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique default public.next_purchase_order_code(),
  supplier_id  uuid not null references public.suppliers(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  status       purchase_order_status not null default 'borrador',
  reference    text not null default '',           -- número de factura del proveedor
  notes        text not null default '',
  total_amount numeric(12,2) not null default 0,    -- mantenido por trigger
  created_by   uuid references public.app_users(id) on delete set null,
  received_by  uuid references public.app_users(id) on delete set null,
  received_at  timestamptz,
  movement_id  uuid references public.inventory_movements(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists po_status_idx     on public.purchase_orders(status);
create index if not exists po_supplier_idx   on public.purchase_orders(supplier_id);
create index if not exists po_warehouse_idx  on public.purchase_orders(warehouse_id);
create index if not exists po_created_idx    on public.purchase_orders(created_at desc);

create table if not exists public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id        text not null references public.products(id) on delete restrict,
  quantity          integer not null check (quantity > 0),
  unit_cost         numeric(10,2) not null default 0 check (unit_cost >= 0),
  line_total        numeric(12,2) generated always as (quantity * unit_cost) stored,
  position          integer not null default 0
);

create index if not exists po_lines_po_idx on public.purchase_order_lines(purchase_order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: mantener purchase_orders.total_amount = sum(lines.line_total)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.recalc_po_total()
returns trigger language plpgsql as $$
declare
  po_id uuid := coalesce(NEW.purchase_order_id, OLD.purchase_order_id);
begin
  update public.purchase_orders
  set total_amount = coalesce((
    select sum(line_total) from public.purchase_order_lines where purchase_order_id = po_id
  ), 0),
  updated_at = now()
  where id = po_id;
  return null;
end $$;

drop trigger if exists tg_po_lines_recalc on public.purchase_order_lines;
create trigger tg_po_lines_recalc
  after insert or update or delete on public.purchase_order_lines
  for each row execute function public.recalc_po_total();

-- Guardar las líneas (y por tanto el total) inmutables una vez recibida.
create or replace function public.guard_po_lines_immutable()
returns trigger language plpgsql as $$
declare
  st purchase_order_status;
  po_id uuid := coalesce(NEW.purchase_order_id, OLD.purchase_order_id);
begin
  select status into st from public.purchase_orders where id = po_id;
  if st in ('recibida', 'cancelada') then
    raise exception 'No se pueden modificar líneas de una orden % (%)', po_id, st;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists tg_po_lines_guard on public.purchase_order_lines;
create trigger tg_po_lines_guard
  before insert or update or delete on public.purchase_order_lines
  for each row execute function public.guard_po_lines_immutable();

-- updated_at en suppliers y purchase_orders
drop trigger if exists tg_suppliers_updated_at on public.suppliers;
create trigger tg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_purchase_orders_updated_at on public.purchase_orders;
create trigger tg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.tg_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — deny by default (service_role bypasses)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.suppliers            enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_lines enable row level security;
