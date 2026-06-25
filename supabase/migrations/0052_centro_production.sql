-- 0052_centro_production.sql
-- Fase 2 del "centro como negocio": producción con PRECIO DE TRANSFERENCIA.
-- Cuando el centro produce, el terminado pasa al almacén central a precio
-- T = costo + 33%·utilidad (utilidad = precio de catálogo − costo). La mipyme le
-- paga al centro (caja), y se generan asientos en ambos libros: el centro
-- "vende" su producción y la mipyme la "compra" a su inventario.
--
--  1. Cuenta 4400 'Ventas de producción' (ingreso del centro por las entregas).
--  2. operation_date en production_orders (fecha de la operación; congela la tasa
--     de esa fecha y fecha los asientos), relleno desde created_at.
--
-- Idempotente. Aplicar después de 0051.

insert into public.accounts (code, name, type) values
  ('4400', 'Ventas de producción', 'ingreso')
on conflict (code) do nothing;

alter table public.production_orders
  add column if not exists operation_date date;
update public.production_orders
  set operation_date = coalesce(produced_at::date, created_at::date)
  where operation_date is null;
alter table public.production_orders
  alter column operation_date set default current_date;
