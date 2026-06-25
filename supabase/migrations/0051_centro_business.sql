-- 0051_centro_business.sql
-- Fase 1 del "centro de elaboración como negocio dentro del negocio": el centro
-- pasa a ser un NEGOCIO propio (contabilidad, capital y cuadres separados de la
-- mipyme).
--
--  1. Alta del negocio 'centro'.
--  2. Los almacenes de tipo centro_elaboracion se reasignan a ese negocio
--     (antes colgaban de 'mipyme'). Así su inventario, caja y asientos quedan en
--     el libro del centro.
--  3. Cuenta 1600 'Inversión en centro': lado mipyme del traspaso de capital
--     (la mipyme convierte caja en inversión en el centro; su capital total no
--     cambia, solo cambia de forma).
--
-- Idempotente. Aplicar después de 0050.

insert into public.businesses (slug, label, code_prefix, kind, active, position)
values ('centro', 'Centro de elaboración', 'CENTRO', 'tienda', true, 11)
on conflict (slug) do nothing;

update public.warehouses set store_slug = 'centro'
where type = 'centro_elaboracion' and store_slug is distinct from 'centro';

insert into public.accounts (code, name, type) values
  ('1600', 'Inversión en centro', 'activo')
on conflict (code) do nothing;
