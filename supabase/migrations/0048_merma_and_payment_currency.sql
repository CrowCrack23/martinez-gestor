-- 0048_merma_and_payment_currency.sql
-- Dos arreglos de lógica de negocio (requisitos del cliente):
--
--  1. MERMA visible como pérdida: cuenta de gasto "Pérdida por merma" (5320)
--     para el asiento automático que genera lib/auto-accounting.ts al registrar
--     una merma (5320 DEBE / Inventario 1300 HABER). Antes la merma bajaba el
--     inventario pero no dejaba rastro contable ni en el cuadre.
--
--  2. Moneda de pago de la compra: purchase_orders.payment_currency (CUP|USD).
--     El asiento de una compra pagada de contado descuenta de Caja CUP (1110) o
--     Caja USD (1120) según esta moneda. Antes siempre salía de Caja CUP.
--
-- Idempotente.

-- ── 1. Cuenta de pérdida por merma ───────────────────────────────────────────
insert into public.accounts (code, name, type) values
  ('5320', 'Pérdida por merma', 'gasto')
on conflict (code) do nothing;

-- ── 2. Moneda de pago de la compra ───────────────────────────────────────────
alter table public.purchase_orders
  add column if not exists payment_currency text not null default 'USD'
  check (payment_currency in ('CUP', 'USD'));
