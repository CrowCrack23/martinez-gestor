-- 0008_hr.sql
-- RRHH: posiciones, empleados, asistencia diaria, períodos de nómina.
-- Idempotente.

create table if not exists public.positions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text not null default '',
  base_salary  numeric(12,2) not null default 0 check (base_salary >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.employees (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,             -- ej. 'EMP-001'
  first_name      text not null,
  last_name       text not null default '',
  document_id     text not null default '',         -- cédula / DNI
  phone           text not null default '',
  email           text not null default '',
  address         text not null default '',
  hire_date       date,
  termination_date date,
  position_id     uuid references public.positions(id) on delete set null,
  warehouse_id    uuid references public.warehouses(id) on delete set null,
  app_user_id     uuid references public.app_users(id) on delete set null, -- si tiene acceso al sistema
  monthly_salary  numeric(12,2) not null default 0 check (monthly_salary >= 0),
  active          boolean not null default true,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists employees_active_idx   on public.employees(active);
create index if not exists employees_warehouse_idx on public.employees(warehouse_id);
create index if not exists employees_position_idx on public.employees(position_id);

-- Asistencia por día — un registro por (empleado, fecha)
create table if not exists public.attendance (
  employee_id uuid not null references public.employees(id) on delete cascade,
  day         date not null,
  present     boolean not null default true,
  hours       numeric(4,1) not null default 8 check (hours >= 0 and hours <= 24),
  notes       text not null default '',
  recorded_by uuid references public.app_users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  primary key (employee_id, day)
);

create index if not exists attendance_day_idx on public.attendance(day desc);

-- Nómina: períodos y líneas
do $$ begin
  create type payroll_status as enum ('borrador', 'cerrada');
exception when duplicate_object then null; end $$;

create table if not exists public.payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end   date not null check (period_end >= period_start),
  status       payroll_status not null default 'borrador',
  notes        text not null default '',
  created_by   uuid references public.app_users(id) on delete set null,
  closed_by    uuid references public.app_users(id) on delete set null,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (period_start, period_end)
);

create table if not exists public.payroll_items (
  id              uuid primary key default gen_random_uuid(),
  payroll_run_id  uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete restrict,
  base_salary     numeric(12,2) not null default 0,
  days_worked     numeric(5,1) not null default 0,
  days_in_period  numeric(5,1) not null default 0,
  gross           numeric(12,2) not null default 0,
  deductions      numeric(12,2) not null default 0,
  net             numeric(12,2) not null default 0,
  notes           text not null default '',
  unique (payroll_run_id, employee_id)
);

create index if not exists payroll_items_run_idx on public.payroll_items(payroll_run_id);

-- updated_at
drop trigger if exists tg_positions_updated_at on public.positions;
create trigger tg_positions_updated_at before update on public.positions
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_employees_updated_at on public.employees;
create trigger tg_employees_updated_at before update on public.employees
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_payroll_runs_updated_at on public.payroll_runs;
create trigger tg_payroll_runs_updated_at before update on public.payroll_runs
  for each row execute function public.tg_set_updated_at();

-- Guardar líneas inmutables una vez cerrada la nómina
create or replace function public.guard_payroll_items_immutable()
returns trigger language plpgsql as $$
declare
  st payroll_status;
  rid uuid := coalesce(NEW.payroll_run_id, OLD.payroll_run_id);
begin
  select status into st from public.payroll_runs where id = rid;
  if st = 'cerrada' then
    raise exception 'No se pueden modificar líneas de una nómina cerrada (%).', rid;
  end if;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists tg_payroll_items_guard on public.payroll_items;
create trigger tg_payroll_items_guard
  before insert or update or delete on public.payroll_items
  for each row execute function public.guard_payroll_items_immutable();

-- RLS
alter table public.positions     enable row level security;
alter table public.employees     enable row level security;
alter table public.attendance    enable row level security;
alter table public.payroll_runs  enable row level security;
alter table public.payroll_items enable row level security;
