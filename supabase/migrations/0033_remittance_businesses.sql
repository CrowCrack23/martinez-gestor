-- 0033_remittance_businesses.sql
-- Fase 3 (Remesas): separación en dos negocios contables + entrega multi-moneda.
--
-- Las remesas se separan en DOS negocios: EE.UU. (solo el dueño) y Europa
-- (1 socio, 50/50). El módulo operativo sigue siendo uno (membresías y RLS
-- bajo el slug 'remesas' intactas para no tocar la APK); el negocio CONTABLE
-- de cada remesa se deriva de su origin (eeuu→remesas_eeuu,
-- europa→remesas_europa, ver lib/remittances.ts remittanceBusiness). El slug
-- 'remesas' queda inactivo como histórico contable.
--
-- Entrega multi-moneda: el beneficiario recibe CUP, USD o EUR. La ganancia de
-- la remesa = comisión + diferencia de tasas, y se congela en profit_cup al
-- entregar:
--   comision_cup = commission_usd * exchange_rate
--   costo_cup    = delivery_amount * delivery_cost_rate (tasa de COSTO →CUP)
--   spread_cup   = amount_cup − costo_cup
--   profit_cup   = comision_cup + spread_cup
-- courier_fee_cup: pago al mensajero POR ENTREGA (manual por remesa, decisión
-- del cliente); se liquida agregado en el cuadre semanal.
--
-- Idempotente. Aplicar después de 0032.

-- ── Negocios contables ──────────────────────────────────────────────────
insert into public.businesses (slug, label, code_prefix, kind, active, position) values
  ('remesas_eeuu',   'Remesas EE.UU.', 'REMUS', 'remesas', true, 20),
  ('remesas_europa', 'Remesas Europa', 'REMEU', 'remesas', true, 21)
on conflict (slug) do nothing;

-- El negocio legado queda como histórico (sus asientos no se migran).
update public.businesses set active = false where slug = 'remesas' and active;

-- ── Entrega multi-moneda y ganancia por remesa ──────────────────────────
alter table public.remittance_operations
  add column if not exists delivery_currency  text not null default 'CUP'
    check (delivery_currency in ('CUP','USD','EUR')),
  add column if not exists delivery_amount    numeric(14,2),
  add column if not exists delivery_rate      numeric(14,4),  -- tasa usada con el cliente (origen→moneda entrega)
  add column if not exists delivery_cost_rate numeric(14,4),  -- tasa de COSTO de la moneda entregada → CUP
  add column if not exists profit_cup         numeric(14,2),  -- comisión + spread, congelada al entregar
  add column if not exists courier_fee_cup    numeric(12,2) not null default 0;

-- ── Cuentas contables nuevas ────────────────────────────────────────────
insert into public.accounts (code, name, type) values
  ('4310', 'Diferencia de tasas', 'ingreso'),
  ('5260', 'Pago a mensajeros', 'gasto')
on conflict (code) do nothing;
