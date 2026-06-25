-- 0049_operation_dates.sql
-- "Todo por fechas": cada operación lleva una FECHA DE OPERACIÓN elegible por el
-- usuario (no solo la del día de captura). Con ella se congela la tasa USD→CUP
-- vigente en esa fecha, se fecha el asiento contable y se agrupan los cuadres.
--
-- Se añade operation_date a las 4 tablas de operaciones y se rellena con la mejor
-- fecha histórica disponible para no mover los reportes existentes:
--   - compras: fecha de recepción, si no, de creación
--   - ventas:  fecha de confirmación, si no, de creación
--   - movimientos: fecha de creación
--   - remesas: fecha de entrega/pago, si no, de creación
--
-- Idempotente. Aplicar después de 0048.

-- ── Compras ──────────────────────────────────────────────────────────────────
alter table public.purchase_orders
  add column if not exists operation_date date;
update public.purchase_orders
  set operation_date = coalesce(received_at::date, created_at::date)
  where operation_date is null;
alter table public.purchase_orders
  alter column operation_date set default current_date;

-- ── Ventas ───────────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists operation_date date;
update public.orders
  set operation_date = coalesce(confirmed_at::date, created_at::date)
  where operation_date is null;
alter table public.orders
  alter column operation_date set default current_date;
create index if not exists orders_operation_date_idx on public.orders(operation_date);

-- ── Movimientos de inventario ────────────────────────────────────────────────
alter table public.inventory_movements
  add column if not exists operation_date date;
update public.inventory_movements
  set operation_date = created_at::date
  where operation_date is null;
alter table public.inventory_movements
  alter column operation_date set default current_date;
create index if not exists inventory_movements_operation_date_idx on public.inventory_movements(operation_date);

-- ── Remesas ──────────────────────────────────────────────────────────────────
alter table public.remittance_operations
  add column if not exists operation_date date;
update public.remittance_operations
  set operation_date = coalesce(paid_at::date, created_at::date)
  where operation_date is null;
alter table public.remittance_operations
  alter column operation_date set default current_date;

-- ── Tasa vigente en una fecha (la más reciente registrada en o antes del día) ──
-- Espejo SQL de getRateForDate (lib/currency.ts). Útil para la APK / RPCs.
create or replace function public.usd_rate_on(p_day date)
returns numeric
language sql
stable
as $$
  select rate
    from public.exchange_rates
   where currency_from = 'USD' and currency_to = 'CUP' and day <= p_day
   order by day desc
   limit 1
$$;
