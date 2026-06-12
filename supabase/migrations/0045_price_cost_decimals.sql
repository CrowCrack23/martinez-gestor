-- 0045_price_cost_decimals.sql
-- Costos y precios SIN redondeo a 2 decimales: el cliente necesita capturar
-- costos/precios unitarios con hasta 6 decimales (ej. 12.345678). Se amplía la
-- ESCALA de las columnas de costo/precio UNITARIO a numeric(18,6) y la de los
-- subtotales generados (quantity * unit) a numeric(20,6).
--
-- NO cambia: cantidades (siguen enteras), ni los TOTALES de orden / COGS /
-- asientos contables (siguen a 2 decimales — son montos de dinero, no se pidió
-- ampliarlos), ni el redondeo del precio de venta CUP a peso entero
-- (product_price_cup / priceCupFromUsd).
--
-- Ampliar la escala de un numeric preserva los valores existentes. Idempotente:
-- re-aplicar deja el mismo tipo. Aplicar después de 0044.

-- ── Compras ──────────────────────────────────────────────────────────────────
-- line_total es generada y depende de unit_cost: se elimina y se recrea ancha.
alter table public.purchase_order_lines drop column if exists line_total;
alter table public.purchase_order_lines
  alter column unit_cost     type numeric(18,6),
  alter column unit_cost_usd type numeric(18,6);
alter table public.purchase_order_lines
  add column if not exists line_total numeric(20,6)
  generated always as (quantity * unit_cost) stored;

-- ── Ventas ───────────────────────────────────────────────────────────────────
alter table public.order_lines drop column if exists line_total;
alter table public.order_lines
  alter column unit_price     type numeric(18,6),
  alter column unit_price_usd type numeric(18,6);
alter table public.order_lines
  add column if not exists line_total numeric(20,6)
  generated always as (quantity * unit_price) stored;

-- ── Costeo (los costos unitarios viajan por el movimiento y los lotes) ────────
alter table public.inventory_movement_lines
  alter column unit_cost     type numeric(18,6),
  alter column unit_cost_usd type numeric(18,6);

alter table public.inventory_lots
  alter column unit_cost     type numeric(18,6),
  alter column unit_cost_usd type numeric(18,6);

alter table public.inventory_lot_consumptions
  alter column unit_cost     type numeric(18,6),
  alter column unit_cost_usd type numeric(18,6);

-- ── Precios de producto ──────────────────────────────────────────────────────
alter table public.product_prices
  alter column price type numeric(18,6);

-- products.price es el precio USD del catálogo, COMPARTIDO con martinez-global.
-- Ampliar la escala es compatible hacia atrás (la tienda online sigue leyendo
-- igual; los valores con 2 decimales siguen siendo válidos).
alter table public.products
  alter column price type numeric(18,6);
