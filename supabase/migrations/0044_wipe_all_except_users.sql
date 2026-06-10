-- 0044_wipe_all_except_users.sql
-- ⚠️ DESTRUCTIVO — DE UNA SOLA VEZ. ⚠️
--
-- Borra TODOS los datos de la base salvo la identidad de los usuarios y la
-- configuración mínima de la que depende su acceso, y luego recrea las cajas
-- (tenedores de dinero) de los negocios de remesas.
--
-- SE CONSERVA:
--   app_users, roles, user_roles, user_businesses, business_members  (login + permisos)
--   businesses, stores  (referentes FK de los que dependen los usuarios y las cajas)
--
-- SE BORRA TODO LO DEMÁS:
--   productos, precios, categorías, combos, BOM, almacenes, stock, proveedores,
--   clientes, plan de cuentas, tasas de cambio, empleados, puestos, socios,
--   business_settings/members de remesas, y TODAS las transacciones (ventas,
--   compras, producción, inventario/lotes, asientos, nómina, asistencia,
--   remesas, movimientos de dinero, distribuciones, aportes, activos fijos,
--   cuadres, cajas previas, etc.)
--
-- Ejecutar UNA vez en el SQL Editor de Supabase. Va en una transacción: si algo
-- falla, no borra nada.

begin;

-- Desactiva los triggers de FK para borrar en cualquier orden sin violar
-- restricciones. Se restaura al final (y el rollback lo restaura solo).
set local session_replication_role = replica;

do $$
declare
  r record;
  keep text[] := array[
    'app_users', 'roles', 'user_roles', 'user_businesses', 'business_members',
    'businesses', 'stores'
  ];
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and not (tablename = any (keep))
  loop
    execute format('delete from public.%I', r.tablename);
  end loop;
end $$;

set local session_replication_role = origin;

-- Reiniciar numeración de códigos de documentos.
alter sequence if exists public.sales_order_seq      restart with 1;
alter sequence if exists public.purchase_order_seq   restart with 1;
alter sequence if exists public.journal_entry_seq    restart with 1;
alter sequence if exists public.remittance_seq       restart with 1;
alter sequence if exists public.production_order_seq restart with 1;

-- Recrear las cajas de los negocios de remesas.
insert into public.money_holders (business_slug, name, kind, location, active)
values
  ('remesas_eeuu',   'Caja remesas EE.UU.', 'caja', 'aca', true),
  ('remesas_europa', 'Caja remesas Europa', 'caja', 'aca', true);

commit;
