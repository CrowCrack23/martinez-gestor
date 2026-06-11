-- 0045_exact_price_and_purchase_payment.sql
-- Dos ajustes pedidos por el dueño:
--
-- 1) PRECIO CUP EXACTO. El precio de venta CUP deja de redondearse al múltiplo
--    de 5 hacia arriba; ahora es la conversión exacta USD × tasa redondeada al
--    peso entero. (Espejo SQL de lib/currency.ts priceCupFromUsd.)
--
-- 2) FORMA DE PAGO DE LA COMPRA. Cada orden de compra puede pagarse de contado
--    (sale de la caja del negocio) o a crédito (cuentas por pagar). Se guarda en
--    purchase_orders.paid_cash; el asiento automático elige la cuenta de haber.
--
-- Idempotente. Aplicar después de 0044.

-- 1) Precio CUP de venta = conversión exacta al peso entero (sin múltiplo de 5).
create or replace function public.product_price_cup(p_usd numeric, p_rate numeric)
returns numeric
language sql immutable
as $$
  select round(p_usd * p_rate)
$$;

-- 2) Forma de pago de la compra: contado (true) o crédito (false).
alter table public.purchase_orders
  add column if not exists paid_cash boolean not null default false;
