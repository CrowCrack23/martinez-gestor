-- 0018_accounting_by_business.sql
-- Contabilidad por negocio (libros separados).
--
-- Modelo: plan de cuentas COMPARTIDO + dimensión "negocio" en cada asiento.
-- Un "negocio" es una tienda (stores) O bien "remesas" (negocio aparte, sin
-- tienda ni stock). Cada negocio tiene su propia numeración de asientos con
-- prefijo (ROPA-2026-00001, REM-2026-00001) y sus reportes (balance, diario,
-- estado de resultados) se pueden ver por negocio o consolidados (suma de todos).
--
-- Idempotente. Aplicar después de 0017. (Los datos previos son de prueba; no se
-- migran saldos.)

-- ── Catálogo de negocios (dimensión contable) ────────────────────────────────
create table if not exists public.businesses (
  slug        text primary key,
  label       text not null,
  code_prefix text not null,                       -- ROPA, MOTOS, REM, ...
  kind        text not null default 'tienda',      -- 'tienda' | 'remesas'
  active      boolean not null default true,
  position    int not null default 0
);

-- Seed: un negocio por cada tienda activa + el negocio "remesas".
insert into public.businesses (slug, label, code_prefix, kind, active, position)
select s.slug, s.label, upper(s.slug), 'tienda', s.active, s.position
from public.stores s
on conflict (slug) do nothing;

insert into public.businesses (slug, label, code_prefix, kind, active, position)
values ('remesas', 'Remesas', 'REM', 'remesas', true, 100)
on conflict (slug) do nothing;

alter table public.businesses enable row level security;

-- ── Numeración de asientos por negocio ───────────────────────────────────────
-- Contador independiente por (negocio, año). El asiento sin negocio usa 'general'.
create table if not exists public.journal_entry_counters (
  business text not null,
  year     int  not null,
  n        int  not null default 0,
  primary key (business, year)
);

create or replace function public.next_business_entry_code(p_business text)
returns text language plpgsql as $$
declare
  b   text := coalesce(p_business, 'general');
  y   int  := extract(year from now())::int;
  pfx text;
  seq int;
begin
  select code_prefix into pfx from public.businesses where slug = p_business;
  if pfx is null then pfx := 'GEN'; end if;
  insert into public.journal_entry_counters (business, year, n)
    values (b, y, 1)
  on conflict (business, year)
    do update set n = public.journal_entry_counters.n + 1
  returning n into seq;
  return pfx || '-' || y::text || '-' || lpad(seq::text, 5, '0');
end $$;

-- El código del asiento se genera en un trigger (necesita conocer NEW.business),
-- ya no por el default global next_journal_entry_code().
alter table public.journal_entries alter column code drop default;

create or replace function public.set_journal_entry_code()
returns trigger language plpgsql as $$
begin
  if NEW.code is null or NEW.code = '' then
    NEW.code := public.next_business_entry_code(NEW.business);
  end if;
  return NEW;
end $$;

drop trigger if exists tg_journal_entries_code on public.journal_entries;
create trigger tg_journal_entries_code
  before insert on public.journal_entries
  for each row execute function public.set_journal_entry_code();

-- ── Re-apuntar la FK de business: stores → businesses ────────────────────────
-- (businesses ya contiene todos los slugs de stores por el seed de arriba.)
alter table public.journal_entries drop constraint if exists journal_entries_business_fkey;
alter table public.journal_entries
  add constraint journal_entries_business_fkey
  foreign key (business) references public.businesses(slug)
  on update cascade on delete set null;

-- ── Negocio del empleado (la nómina se reparte por aquí) ──────────────────────
alter table public.employees
  add column if not exists business text references public.businesses(slug)
  on update cascade on delete set null;

create index if not exists employees_business_idx on public.employees(business);
