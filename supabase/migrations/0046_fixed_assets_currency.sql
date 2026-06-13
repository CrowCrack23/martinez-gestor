-- 0046_fixed_assets_currency.sql
-- Infraestructura (activos fijos) en USD funcional: hasta ahora el monto se
-- capturaba solo en CUP y no se congelaba su equivalente USD. Se añade la moneda
-- de captura y el monto USD congelado a la tasa del día (igual que ingresos/gastos
-- de caja). `amount` sigue guardándose en CUP (para que el total de infraestructura
-- en CUP del capital no cambie); `amount_usd` es el USD real congelado.
--
-- Idempotente. Aplicar después de 0045.

alter table public.fixed_assets
  add column if not exists currency   text not null default 'CUP' check (currency in ('CUP','USD')),
  add column if not exists amount_usd numeric(14,2);
