-- 0017_payroll_commission.sql
-- Pago por comisión: cada empleado puede tener un % de comisión sobre las ventas
-- que confirmó (órdenes en estado 'confirmada' cuyo confirmed_by = su usuario).
-- El pago es MIXTO: salario base (puede ser 0) + comisión.
-- Idempotente. Aplicar después de 0016.

-- % de comisión por empleado (ej. 5.00 = 5%).
alter table public.employees
  add column if not exists commission_rate numeric(5,2) not null default 0
  check (commission_rate >= 0 and commission_rate <= 100);

-- Desglose de comisión en cada línea de nómina.
alter table public.payroll_items
  add column if not exists sales_base numeric(14,2) not null default 0;  -- ventas sobre las que se calculó
alter table public.payroll_items
  add column if not exists commission numeric(14,2) not null default 0;  -- monto de comisión (incluido en gross)
