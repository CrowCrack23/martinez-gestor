-- 0055_freight_cost.sql
-- Gasto de TRANSPORTACIÓN (flete) que se SUMA AL COSTO de los productos.
-- Se captura en USD (moneda funcional) y se reparte entre las líneas en
-- proporción a su valor, subiendo el costo unitario de los lotes (costo
-- "puesto en almacén" / landed cost).
--
--  - purchase_orders.freight_usd: flete de la compra (se aplica al recibir).
--  - inventory_movements.freight_usd: flete de una entrada manual de inventario.
--
-- Idempotente. Aplicar después de 0054.

alter table public.purchase_orders
  add column if not exists freight_usd numeric(18,6) not null default 0;

alter table public.inventory_movements
  add column if not exists freight_usd numeric(18,6) not null default 0;
