-- 0011_accounting.sql
-- Contabilidad: plan de cuentas + asientos de diario doble entrada.
-- Idempotente. Incluye un plan de cuentas base que puedes ampliar.

do $$ begin
  create type account_type as enum ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type journal_entry_status as enum ('borrador', 'contabilizada');
exception when duplicate_object then null; end $$;

create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                -- e.g. '1100', '4000'
  name        text not null,
  type        account_type not null,
  parent_id   uuid references public.accounts(id) on delete restrict,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists accounts_type_idx on public.accounts(type);
create index if not exists accounts_parent_idx on public.accounts(parent_id);

create sequence if not exists public.journal_entry_seq;
create or replace function public.next_journal_entry_code()
returns text language plpgsql as $$
declare n integer;
begin
  n := nextval('public.journal_entry_seq');
  return 'AS-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 5, '0');
end $$;

create table if not exists public.journal_entries (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default public.next_journal_entry_code(),
  entry_date      date not null default current_date,
  description     text not null default '',
  reference_type  text not null default 'manual',  -- 'manual' | 'compra' | 'venta' | 'nomina' | 'remesa'
  reference_id    text,
  total_debit     numeric(14,2) not null default 0,
  total_credit    numeric(14,2) not null default 0,
  status          journal_entry_status not null default 'borrador',
  created_by      uuid references public.app_users(id) on delete set null,
  posted_by       uuid references public.app_users(id) on delete set null,
  posted_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists je_date_idx   on public.journal_entries(entry_date desc);
create index if not exists je_status_idx on public.journal_entries(status);

create table if not exists public.journal_lines (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references public.journal_entries(id) on delete cascade,
  account_id  uuid not null references public.accounts(id) on delete restrict,
  debit       numeric(14,2) not null default 0 check (debit >= 0),
  credit      numeric(14,2) not null default 0 check (credit >= 0),
  description text not null default '',
  position    integer not null default 0,
  -- Una línea es solo débito o solo crédito, nunca ambos ni ninguno
  constraint jl_one_side check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists jl_entry_idx   on public.journal_lines(entry_id);
create index if not exists jl_account_idx on public.journal_lines(account_id);

-- Recalcular totales del asiento cuando cambian las líneas
create or replace function public.recalc_journal_totals()
returns trigger language plpgsql as $$
declare eid uuid := coalesce(NEW.entry_id, OLD.entry_id);
begin
  update public.journal_entries set
    total_debit  = coalesce((select sum(debit)  from public.journal_lines where entry_id = eid), 0),
    total_credit = coalesce((select sum(credit) from public.journal_lines where entry_id = eid), 0),
    updated_at = now()
  where id = eid;
  return null;
end $$;

drop trigger if exists tg_journal_lines_recalc on public.journal_lines;
create trigger tg_journal_lines_recalc
  after insert or update or delete on public.journal_lines
  for each row execute function public.recalc_journal_totals();

-- Guardar las líneas inmutables una vez contabilizado
create or replace function public.guard_journal_immutable()
returns trigger language plpgsql as $$
declare st journal_entry_status;
        eid uuid := coalesce(NEW.entry_id, OLD.entry_id);
begin
  select status into st from public.journal_entries where id = eid;
  if st = 'contabilizada' then
    raise exception 'No se pueden modificar líneas de un asiento contabilizado.';
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists tg_journal_lines_guard on public.journal_lines;
create trigger tg_journal_lines_guard
  before insert or update or delete on public.journal_lines
  for each row execute function public.guard_journal_immutable();

drop trigger if exists tg_accounts_updated_at on public.accounts;
create trigger tg_accounts_updated_at before update on public.accounts
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_journal_entries_updated_at on public.journal_entries;
create trigger tg_journal_entries_updated_at before update on public.journal_entries
  for each row execute function public.tg_set_updated_at();

-- Plan de cuentas base (puedes ampliar luego)
insert into public.accounts (code, name, type) values
  -- ACTIVOS
  ('1000','Activos',               'activo'),
  ('1100','Caja y bancos',         'activo'),
  ('1110','Caja CUP',              'activo'),
  ('1120','Caja USD',              'activo'),
  ('1130','Banco',                 'activo'),
  ('1200','Cuentas por cobrar',    'activo'),
  ('1300','Inventario',            'activo'),
  -- PASIVOS
  ('2000','Pasivos',               'pasivo'),
  ('2100','Cuentas por pagar',     'pasivo'),
  ('2200','Impuestos por pagar',   'pasivo'),
  ('2300','Salarios por pagar',    'pasivo'),
  -- PATRIMONIO
  ('3000','Patrimonio',            'patrimonio'),
  ('3100','Capital social',        'patrimonio'),
  ('3200','Utilidades retenidas',  'patrimonio'),
  -- INGRESOS
  ('4000','Ingresos',              'ingreso'),
  ('4100','Ventas online',         'ingreso'),
  ('4200','Ventas tienda',         'ingreso'),
  ('4300','Comisiones remesas',    'ingreso'),
  -- GASTOS
  ('5000','Gastos',                'gasto'),
  ('5100','Costo de ventas',       'gasto'),
  ('5200','Salarios',              'gasto'),
  ('5300','Servicios',             'gasto'),
  ('5400','Otros gastos',          'gasto')
on conflict (code) do nothing;

alter table public.accounts         enable row level security;
alter table public.journal_entries  enable row level security;
alter table public.journal_lines    enable row level security;
