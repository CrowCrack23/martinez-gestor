-- 0053_centro_closures.sql
-- Fase 3 del "centro como negocio": cuadres propios del centro de elaboración.
-- A diferencia del cuadre de los puntos de venta (basado en ventas a clientes),
-- el del centro se basa en sus ENTREGAS DE PRODUCCIÓN al almacén central: su
-- ingreso (precio de transferencia), su costo, la ganancia, y el 33% que se paga
-- a los obreros sobre esa ganancia.
--
-- El cuadre DIARIO se congela en esta tabla (única por negocio+día). El SEMANAL
-- se calcula al vuelo. Idempotente. Aplicar después de 0052.

create table if not exists public.centro_closures (
  id             uuid primary key default gen_random_uuid(),
  business_slug  text not null default 'centro' references public.businesses(slug) on update cascade,
  day            date not null,
  revenue_cup    numeric(14,2) not null default 0,  -- Σ precio de transferencia (T)
  cost_cup       numeric(14,2) not null default 0,  -- Σ costo de insumos (C)
  profit_cup     numeric(14,2) not null default 0,  -- T − C (ganancia del centro)
  worker_pct     numeric(5,2)  not null default 0,  -- % a obreros (33)
  worker_pay_cup numeric(14,2) not null default 0,  -- worker_pct% de la ganancia
  net_cup        numeric(14,2) not null default 0,  -- ganancia − pago a obreros
  order_count    integer       not null default 0,
  rate_used      numeric(12,4),
  closed_by      uuid references public.app_users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (business_slug, day)
);

create index if not exists centro_closures_day_idx on public.centro_closures(day desc);

alter table public.centro_closures enable row level security;
