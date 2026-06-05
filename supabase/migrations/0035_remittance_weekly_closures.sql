-- 0035_remittance_weekly_closures.sql
-- Cuadre SEMANAL de remesas por negocio (snapshot confirmable).
--
-- Se previsualiza al vuelo (lib/remittance-closures.ts) sobre las remesas
-- ENTREGADAS de la semana (paid_at ∈ [lunes, +7)) del negocio (origin) y al
-- confirmarse se congela: entregadas, comisiones, diferencia de tasas,
-- ganancia, pago a mensajeros (Σ courier_fee_cup, asiento 5260/1110) y neto.
-- Para Remesas Europa se generan líneas de reparto por socio (50/50 desde
-- business_partners de 'remesas_europa'); el pago a cada socio se registra
-- después (asiento Retiros de socios 3300 / Caja 1110).
--
-- Idempotente. Aplicar después de 0034.

create table if not exists public.remittance_weekly_closures (
  id              uuid primary key default gen_random_uuid(),
  business_slug   text not null references public.businesses(slug) on update cascade on delete restrict,
  week_start      date not null,                     -- lunes de la semana
  delivered_count integer not null default 0,
  commissions_cup numeric(14,2) not null default 0,
  spread_cup      numeric(14,2) not null default 0,  -- diferencia de tasas
  profit_cup      numeric(14,2) not null default 0,  -- comisiones + spread
  courier_pay_cup numeric(14,2) not null default 0,  -- Σ courier_fee_cup
  net_cup         numeric(14,2) not null default 0,  -- profit − courier_pay
  status          text not null default 'confirmada' check (status in ('confirmada','pagada_parcial','pagada')),
  notes           text not null default '',
  closed_by       uuid references public.app_users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (business_slug, week_start)
);

create index if not exists rem_weekly_closures_business_idx
  on public.remittance_weekly_closures(business_slug, week_start desc);

create table if not exists public.remittance_closure_partner_lines (
  id               uuid primary key default gen_random_uuid(),
  closure_id       uuid not null references public.remittance_weekly_closures(id) on delete cascade,
  partner_id       uuid not null references public.business_partners(id) on delete restrict,
  profit_pct       numeric(5,2) not null,
  amount           numeric(14,2) not null,
  paid_at          date,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  unique (closure_id, partner_id)
);

alter table public.remittance_weekly_closures enable row level security;
alter table public.remittance_closure_partner_lines enable row level security;
