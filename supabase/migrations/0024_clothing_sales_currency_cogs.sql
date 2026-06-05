-- 0024_clothing_sales_currency_cogs.sql
-- Ventas multi-moneda (CUP/USD) + COGS persistido por orden.
--
-- Modelo: la forma de pago (payment_method) y la moneda (currency) son ejes
-- separados. total_amount SIGUE siempre en CUP (lo recalcula el trigger desde
-- las líneas, que están a precio de catálogo en CUP). Para una venta cobrada
-- en USD: sale_rate = tasa USD→CUP del día (snapshot) y amount_usd =
-- total_amount / sale_rate (lo que entró a la caja en dólares). El cuadre
-- diario desglosa el dinero por (payment_method, currency).
--
-- cogs_total: costo FIFO de lo vendido, congelado al confirmar la orden
-- (snapshot de movementCost). Lo usan comisiones por ganancia y cuadres sin
-- recorrer inventory_lot_consumptions.
--
-- Idempotente. Aplicar después de 0023.

alter table public.orders add column if not exists currency text not null default 'CUP'
  check (currency in ('CUP', 'USD'));
alter table public.orders add column if not exists amount_usd numeric(14,2)
  check (amount_usd is null or amount_usd >= 0);
alter table public.orders add column if not exists sale_rate numeric(12,4)
  check (sale_rate is null or sale_rate > 0);
alter table public.orders add column if not exists cogs_total numeric(14,2) not null default 0
  check (cogs_total >= 0);

-- Los cuadres agregan por día de confirmación.
create index if not exists orders_confirmed_at_idx on public.orders(confirmed_at);
