-- 0040_usd_functional_schema.sql
-- USD como moneda funcional: columnas duales congeladas en cada transacción.
--
-- Problema: el libro está en CUP y se convertía a USD con la tasa de HOY al
-- reportar. Con el CUP devaluándose a diario eso produce ganancias ilusorias:
-- compras a tasa 300, vendes a tasa 400, el CUP "gana" pero en USD perdiste.
--
-- Solución: cada transacción guarda su monto USD CONGELADO a la tasa del día
-- en que ocurrió. La ganancia real = USD entrante − USD costo histórico.
--   • purchase_orders/orders: tasa + total USD de la operación.
--   • inventory_lots/consumptions: costo unitario USD congelado (FIFO en USD).
--   • journal_entries/lines: doble columna — el libro suma CUP y USD en
--     paralelo, cada línea con su USD congelado a la fecha del asiento.
--
-- IMPORTANTE: aplicar ANTES de desplegar el código TS nuevo (el trigger de
-- totales debe sumar USD desde el primer asiento).
-- Idempotente. Aplicar después de 0039.

-- ── Compras ──────────────────────────────────────────────────────────────────
alter table public.purchase_orders
  add column if not exists rate      numeric(12,4),
  add column if not exists total_usd numeric(14,2);

alter table public.purchase_order_lines
  add column if not exists unit_cost_usd numeric(14,2);

-- ── Ventas ───────────────────────────────────────────────────────────────────
-- orders ya tiene sale_rate y amount_usd (0024); falta el COGS en USD.
alter table public.orders
  add column if not exists cogs_usd numeric(14,2) not null default 0;

alter table public.order_lines
  add column if not exists unit_price_usd numeric(14,2);

-- ── Costeo FIFO ──────────────────────────────────────────────────────────────
alter table public.inventory_lots
  add column if not exists unit_cost_usd numeric(14,2) not null default 0,
  add column if not exists rate          numeric(12,4);

alter table public.inventory_lot_consumptions
  add column if not exists unit_cost_usd numeric(14,2) not null default 0;

alter table public.inventory_movement_lines
  add column if not exists unit_cost_usd numeric(14,2);

-- ── Libro contable dual ──────────────────────────────────────────────────────
alter table public.journal_entries
  add column if not exists exchange_rate    numeric(12,4),
  add column if not exists total_debit_usd  numeric(14,2) not null default 0,
  add column if not exists total_credit_usd numeric(14,2) not null default 0;

alter table public.journal_lines
  add column if not exists debit_usd  numeric(14,2) not null default 0 check (debit_usd >= 0),
  add column if not exists credit_usd numeric(14,2) not null default 0 check (credit_usd >= 0);

-- El trigger de totales ahora suma también las columnas USD.
create or replace function public.recalc_journal_totals()
returns trigger language plpgsql as $$
declare eid uuid := coalesce(NEW.entry_id, OLD.entry_id);
begin
  update public.journal_entries set
    total_debit      = coalesce((select sum(debit)      from public.journal_lines where entry_id = eid), 0),
    total_credit     = coalesce((select sum(credit)     from public.journal_lines where entry_id = eid), 0),
    total_debit_usd  = coalesce((select sum(debit_usd)  from public.journal_lines where entry_id = eid), 0),
    total_credit_usd = coalesce((select sum(credit_usd) from public.journal_lines where entry_id = eid), 0),
    updated_at = now()
  where id = eid;
  return null;
end $$;

-- Cuenta para el descuadre CUP entre el costo histórico del inventario y el
-- costo a tasa de venta (sus líneas siempre llevan USD = 0, así el P&L USD
-- queda limpio y el CUP cuadra).
insert into public.accounts (code, name, type) values
  ('5310', 'Diferencia de tasa de inventario', 'gasto')
on conflict (code) do nothing;
