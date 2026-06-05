-- 0025_daily_closures.sql
-- Cuadres diarios por punto de venta (snapshot confirmable).
--
-- El cuadre se PREVISUALIZA al vuelo (lib/closures.ts) sobre las órdenes
-- confirmadas del día y, al confirmarse, se congela aquí: totales, comisión
-- del trabajador (% sobre la ganancia, snapshot del pct vigente) y desglose
-- del dinero (efectivo CUP / transferencia / USD). Idempotente por
-- (warehouse_id, day). El cuadre semanal NO se persiste: se calcula al vuelo.
--
-- Idempotente. Aplicar después de 0024.

create table if not exists public.daily_closures (
  id             uuid primary key default gen_random_uuid(),
  warehouse_id   uuid not null references public.warehouses(id) on delete restrict,
  business_slug  text not null references public.businesses(slug) on update cascade on delete restrict,
  day            date not null,

  -- Totales del día (CUP salvo sufijo _usd).
  revenue_cup    numeric(14,2) not null default 0,  -- ventas normalizadas a CUP
  cogs_cup       numeric(14,2) not null default 0,  -- costo FIFO de lo vendido
  cogs_usd       numeric(14,2) not null default 0,  -- el mismo costo valuado en USD (cogs_cup / rate_used)
  profit_cup     numeric(14,2) not null default 0,  -- revenue − cogs

  -- Pago del trabajador del punto: % (snapshot) sobre la ganancia del día.
  commission_pct numeric(5,2)  not null default 0,
  commission_cup numeric(14,2) not null default 0,
  net_cup        numeric(14,2) not null default 0,  -- profit − commission

  -- Desglose del dinero según cómo pagaron los clientes.
  cash_cup       numeric(14,2) not null default 0,  -- efectivo en CUP
  transfer_cup   numeric(14,2) not null default 0,  -- transferencia/tarjeta en CUP
  usd_total      numeric(14,2) not null default 0,  -- cobrado en USD (en USD)

  order_count    integer not null default 0,
  rate_used      numeric(12,4),                     -- tasa USD→CUP usada para cogs_usd
  notes          text not null default '',
  closed_by      uuid references public.app_users(id) on delete set null,
  created_at     timestamptz not null default now(),

  unique (warehouse_id, day)
);

create index if not exists daily_closures_business_idx on public.daily_closures(business_slug, day desc);

alter table public.daily_closures enable row level security;

-- Cuenta de gasto para la comisión del trabajador del punto (el asiento lo
-- genera confirmDailyClosure: Comisiones de venta / Caja CUP).
insert into public.accounts (code, name, type) values
  ('5250', 'Comisiones de venta', 'gasto')
on conflict (code) do nothing;
