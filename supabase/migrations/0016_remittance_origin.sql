-- 0016_remittance_origin.sql
-- Separa las remesas por origen: Estados Unidos (USD) y Europa (EUR).
-- El monto enviado (columna amount_usd) y la comisión (commission_usd) se
-- interpretan en la moneda del origen: USD para 'eeuu', EUR para 'europa'.
-- La tasa (exchange_rate) es siempre <moneda origen> → CUP, y amount_cup ya se
-- calcula como amount_usd * exchange_rate (sirve igual para EUR).
-- Idempotente. Aplicar después de 0015.

do $$ begin
  create type remittance_origin as enum ('eeuu', 'europa');
exception when duplicate_object then null; end $$;

alter table public.remittance_operations
  add column if not exists origin remittance_origin not null default 'eeuu';

create index if not exists remittances_origin_idx on public.remittance_operations(origin);
