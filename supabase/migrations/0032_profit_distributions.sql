-- 0032_profit_distributions.sql
-- Reparto mensual de ganancias a socios (snapshot confirmable).
--
-- El reparto se PREVISUALIZA al vuelo (lib/profit-sharing.ts) sobre la
-- utilidad del mes (incomeStatement del negocio, incluyendo borradores por
-- defecto: los asientos automáticos quedan en borrador) y al confirmarse se
-- congela aquí: % de crecimiento snapshot, monto para la empresa y línea por
-- socio. El cliente registra después el pago a cada socio (paid_at), lo que
-- genera el asiento Retiros de socios (3300) DEBE / Caja CUP (1110) HABER.
-- Único por (business_slug, period_month).
--
-- Idempotente. Aplicar después de 0031.

create table if not exists public.profit_distributions (
  id             uuid primary key default gen_random_uuid(),
  business_slug  text not null references public.businesses(slug) on update cascade on delete restrict,
  period_month   date not null,                      -- día 1 del mes repartido
  base_profit    numeric(14,2) not null,             -- utilidad neta del mes
  growth_pct     numeric(5,2) not null default 0,    -- snapshot % empresa
  growth_amount  numeric(14,2) not null default 0,   -- base_profit × growth_pct
  distributable  numeric(14,2) not null default 0,   -- base_profit − growth_amount
  include_drafts boolean not null default true,      -- la utilidad incluyó borradores
  status         text not null default 'calculada' check (status in ('calculada','pagada_parcial','pagada')),
  created_by     uuid references public.app_users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (business_slug, period_month)
);

create table if not exists public.profit_distribution_lines (
  id               uuid primary key default gen_random_uuid(),
  distribution_id  uuid not null references public.profit_distributions(id) on delete cascade,
  partner_id       uuid not null references public.business_partners(id) on delete restrict,
  profit_pct       numeric(5,2) not null,            -- snapshot % del socio
  amount           numeric(14,2) not null,
  paid_at          date,                             -- cuándo se le pagó (lo registra el cliente)
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  unique (distribution_id, partner_id)
);

create index if not exists profit_distributions_business_idx
  on public.profit_distributions(business_slug, period_month desc);

alter table public.profit_distributions enable row level security;
alter table public.profit_distribution_lines enable row level security;
