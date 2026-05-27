-- 0012_inventory_costing.sql
-- Costeo de inventario por lotes con consumo FIFO.
-- Cada entrada de stock crea un lote con su costo unitario; cada salida consume
-- lotes del más antiguo al más nuevo y registra el costo real (COGS).
-- Esto alimenta la contabilidad automática (ver lib/auto-accounting.ts).
-- Idempotente. Aplicar en el SQL Editor de Supabase después de 0011.

-- ─────────────────────────────────────────────────────────────────────────────
-- LOTES  (cada ingreso de stock con su costo)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.inventory_lots (
  id            uuid primary key default gen_random_uuid(),
  product_id    text not null references public.products(id) on delete restrict,
  warehouse_id  uuid not null references public.warehouses(id) on delete restrict,
  unit_cost     numeric(14,2) not null default 0 check (unit_cost >= 0),
  qty_received  integer not null check (qty_received > 0),
  qty_remaining integer not null check (qty_remaining >= 0),
  source_type   text not null default 'compra',   -- compra | produccion | transferencia | ajuste | inicial
  source_id     text,
  movement_id   uuid references public.inventory_movements(id) on delete set null,
  received_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Índice para el "picking" FIFO: lotes con saldo, ordenados por antigüedad.
create index if not exists inventory_lots_pick_idx
  on public.inventory_lots(product_id, warehouse_id, received_at)
  where qty_remaining > 0;
create index if not exists inventory_lots_movement_idx on public.inventory_lots(movement_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONSUMOS  (qué lote cubrió cada salida — trazabilidad y COGS)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.inventory_lot_consumptions (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references public.inventory_lots(id) on delete restrict,
  movement_id  uuid not null references public.inventory_movements(id) on delete cascade,
  product_id   text not null,
  warehouse_id uuid not null,
  quantity     integer not null check (quantity > 0),
  unit_cost    numeric(14,2) not null,
  created_at   timestamptz not null default now()
);

create index if not exists lot_consumptions_movement_idx on public.inventory_lot_consumptions(movement_id);
create index if not exists lot_consumptions_lot_idx       on public.inventory_lot_consumptions(lot_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- LOTES DE APERTURA
-- El stock que ya existe (creado antes de esta migración) no tiene costo conocido.
-- Se ingresa como lote 'inicial' a costo 0, ajustable luego desde /inventario/lotes.
-- El `not exists` lo hace idempotente: no duplica si ya hay lotes para esa ubicación.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.inventory_lots (product_id, warehouse_id, unit_cost, qty_received, qty_remaining, source_type)
select sl.product_id, sl.warehouse_id, 0, sl.quantity, sl.quantity, 'inicial'
from public.stock_locations sl
where sl.quantity > 0
  and not exists (
    select 1 from public.inventory_lots il
    where il.product_id = sl.product_id and il.warehouse_id = sl.warehouse_id
  );

alter table public.inventory_lots             enable row level security;
alter table public.inventory_lot_consumptions enable row level security;
