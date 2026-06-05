-- 0023_points_of_sale.sql
-- Puntos de venta (negocio de ropa, extensible a mercaditos).
--
-- Un punto de venta ES un warehouse (nuevo valor de enum 'punto_venta'): reusa
-- stock_locations, costeo FIFO, transferencias y orders.warehouse_id. Lo único
-- nuevo es ligar el trabajador FIJO del punto y su % de comisión sobre la
-- GANANCIA (venta − costo) de las ventas de su punto (requisito del cliente:
-- % negociable por trabajador). No confundir con employees.commission_rate
-- (comisión de nómina sobre el TOTAL de ventas) ni con
-- business_members.commission_pct (comisión del gestor de remesas).
--
-- Idempotente. Aplicar después de 0022.

-- ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción con uso
-- posterior del valor; va primero y solo (el SQL Editor de Supabase lo admite).
alter type warehouse_type add value if not exists 'punto_venta';

create table if not exists public.point_of_sale_staff (
  warehouse_id   uuid primary key references public.warehouses(id) on delete cascade,
  user_id        uuid not null references public.app_users(id) on delete restrict,
  -- % sobre la ganancia (venta − costo FIFO) del día de SU punto de venta.
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists pos_staff_user_idx on public.point_of_sale_staff(user_id);

drop trigger if exists tg_pos_staff_updated_at on public.point_of_sale_staff;
create trigger tg_pos_staff_updated_at
  before update on public.point_of_sale_staff
  for each row execute function public.tg_set_updated_at();

alter table public.point_of_sale_staff enable row level security;
