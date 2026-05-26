-- 0010_remittances.sql
-- Remesas: tasa de cambio del día + operaciones (envío USD → entrega CUP).
-- Idempotente.

create table if not exists public.exchange_rates (
  day      date not null,
  currency_from text not null,    -- 'USD'
  currency_to   text not null,    -- 'CUP'
  rate     numeric(12,4) not null check (rate > 0),
  notes    text not null default '',
  created_at timestamptz not null default now(),
  primary key (day, currency_from, currency_to)
);

do $$ begin
  create type remittance_status as enum ('pendiente', 'entregada', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type remittance_payout_method as enum ('efectivo', 'tarjeta_cup', 'transferencia', 'otro');
exception when duplicate_object then null; end $$;

create sequence if not exists public.remittance_seq;
create or replace function public.next_remittance_code()
returns text language plpgsql as $$
declare n integer;
begin
  n := nextval('public.remittance_seq');
  return 'REM-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

create table if not exists public.remittance_operations (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique default public.next_remittance_code(),
  sender_name           text not null,
  sender_phone          text not null default '',
  beneficiary_name      text not null,
  beneficiary_phone     text not null default '',
  beneficiary_doc       text not null default '',         -- CI / documento
  beneficiary_address   text not null default '',
  amount_usd            numeric(12,2) not null check (amount_usd > 0),
  exchange_rate         numeric(12,4) not null check (exchange_rate > 0),
  amount_cup            numeric(14,2) generated always as (amount_usd * exchange_rate) stored,
  commission_usd        numeric(10,2) not null default 0 check (commission_usd >= 0),
  payout_method         remittance_payout_method not null default 'efectivo',
  status                remittance_status not null default 'pendiente',
  notes                 text not null default '',
  created_by            uuid references public.app_users(id) on delete set null,
  paid_by               uuid references public.app_users(id) on delete set null,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists remittances_status_idx  on public.remittance_operations(status);
create index if not exists remittances_created_idx on public.remittance_operations(created_at desc);
create index if not exists remittances_beneficiary_idx on public.remittance_operations(lower(beneficiary_name));

drop trigger if exists tg_remittances_updated_at on public.remittance_operations;
create trigger tg_remittances_updated_at before update on public.remittance_operations
  for each row execute function public.tg_set_updated_at();

alter table public.exchange_rates        enable row level security;
alter table public.remittance_operations enable row level security;
