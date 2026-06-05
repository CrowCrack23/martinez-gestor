-- 0030_capital_contributions.sql
-- Aportes de capital de los socios (MIPYME: 2 de 3 socios aportaron).
--
-- Cada aporte genera (best-effort, en lib/partners.ts) un asiento contable:
-- Caja CUP (1110) o Caja USD (1120) DEBE / Capital social (3100) HABER, con
-- reference_type 'aporte_capital' y business del negocio.
--
-- Idempotente. Aplicar después de 0029.

create table if not exists public.capital_contributions (
  id               uuid primary key default gen_random_uuid(),
  business_slug    text not null references public.businesses(slug) on update cascade on delete restrict,
  partner_id       uuid not null references public.business_partners(id) on delete restrict,
  amount           numeric(14,2) not null check (amount > 0),
  currency         text not null default 'CUP' check (currency in ('CUP','USD')),
  contributed_at   date not null default current_date,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  notes            text not null default '',
  created_by       uuid references public.app_users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists capital_contributions_business_idx
  on public.capital_contributions(business_slug, contributed_at desc);

alter table public.capital_contributions enable row level security;
