-- 0027_clothing_rls.sql
-- RLS para que la APK móvil (martinez-apk) opere VENTAS del punto de venta
-- directo contra Supabase con la anon key. El ERP web sigue usando
-- service_role (bypassa RLS), así que nada de esto afecta al gestor.
--
-- Alcance: el vendedor (membresía activa en point_of_sale_staff) solo ve y
-- opera SU punto de venta: sus órdenes (crear/editar borradores; la
-- confirmación va por la RPC confirm_pos_order de 0026), su stock y los
-- cuadres de su punto. Los borradores son lo único editable: el cambio a
-- 'confirmada' solo lo hace la RPC (que descuenta stock y calcula COGS) — la
-- política de update lo impide a propósito.
--
-- orders/order_lines/stock_locations/warehouses ya tienen RLS habilitado sin
-- políticas desde 0005/0007 (deny-all para anon/authenticated). products vive
-- en martinez-global: aquí solo se agrega GRANT + política de lectura para
-- authenticated SIN tocar su estado de RLS, para no interferir con la tienda
-- online (anon).
--
-- Idempotente. Aplicar después de 0026.

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTs (la RLS no se evalúa sin privilegio de tabla). El INSERT de una orden
-- usa el default next_sales_order_code() → la secuencia necesita USAGE.
-- ─────────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select, insert, update         on public.orders              to authenticated;
grant select, insert, update, delete on public.order_lines         to authenticated;
grant select                         on public.products            to authenticated;
grant select                         on public.stock_locations     to authenticated;
grant select                         on public.warehouses          to authenticated;
grant select                         on public.daily_closures      to authenticated;
grant select                         on public.point_of_sale_staff to authenticated;
grant usage on sequence public.sales_order_seq to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- point_of_sale_staff: cada vendedor lee SU membresía (para saber su punto y %)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists pos_staff_select_self on public.point_of_sale_staff;
create policy pos_staff_select_self on public.point_of_sale_staff
  for select to authenticated
  using (user_id = public.app_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- orders: solo las del punto del vendedor. Crear/editar SOLO borradores; la
-- confirmación (status='confirmada') pasa únicamente por confirm_pos_order.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists ord_select_pos on public.orders;
create policy ord_select_pos on public.orders
  for select to authenticated
  using (warehouse_id in (select public.app_user_pos_warehouses()));

drop policy if exists ord_insert_pos on public.orders;
create policy ord_insert_pos on public.orders
  for insert to authenticated
  with check (
    warehouse_id in (select public.app_user_pos_warehouses())
    and status = 'borrador'
    and (created_by = public.app_user_id() or created_by is null)
  );

drop policy if exists ord_update_pos on public.orders;
create policy ord_update_pos on public.orders
  for update to authenticated
  using (
    warehouse_id in (select public.app_user_pos_warehouses())
    and status = 'borrador'
  )
  with check (
    warehouse_id in (select public.app_user_pos_warehouses())
    and status in ('borrador', 'cancelada')   -- editar borrador o cancelarlo; confirmar = RPC
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- order_lines: por la orden padre (el guard de 0007 ya impide tocar líneas de
-- órdenes confirmadas/canceladas).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists ol_all_pos on public.order_lines;
create policy ol_all_pos on public.order_lines
  for all to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_id
       and o.warehouse_id in (select public.app_user_pos_warehouses())
  ))
  with check (exists (
    select 1 from public.orders o
     where o.id = order_id
       and o.warehouse_id in (select public.app_user_pos_warehouses())
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- stock_locations / warehouses: lectura limitada al punto del vendedor.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists sl_select_pos on public.stock_locations;
create policy sl_select_pos on public.stock_locations
  for select to authenticated
  using (warehouse_id in (select public.app_user_pos_warehouses()));

drop policy if exists wh_select_pos on public.warehouses;
create policy wh_select_pos on public.warehouses
  for select to authenticated
  using (id in (select public.app_user_pos_warehouses()));

-- ─────────────────────────────────────────────────────────────────────────────
-- products: catálogo legible para vendedores autenticados. NO se habilita RLS
-- aquí (la tabla es de martinez-global; si su RLS está activo, esta política
-- aplica; si no, basta el GRANT). No se toca el acceso anon de la tienda online.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists prod_select_auth on public.products;
create policy prod_select_auth on public.products
  for select to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- daily_closures: el vendedor consulta los cuadres de su punto (los confirma
-- el gestor web con service_role).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists dc_select_pos on public.daily_closures;
create policy dc_select_pos on public.daily_closures
  for select to authenticated
  using (warehouse_id in (select public.app_user_pos_warehouses()));
