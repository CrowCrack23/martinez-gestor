-- 0043_wipe_transactions.sql
-- ⚠️ LIMPIEZA DE DATOS DE PRUEBA — DESTRUCTIVO Y DE UNA SOLA VEZ. ⚠️
--
-- Borra TODAS las transacciones para arrancar limpio con el modelo USD
-- funcional (0040–0042). NO es idempotente en el sentido habitual (se puede
-- re-ejecutar, pero borra lo que haya). Ejecutar SOLO cuando estés seguro.
--
-- SE BORRA: asientos, ventas, compras, producción, movimientos y lotes de
-- inventario, cuadres diarios y semanales, nóminas, asistencia, remesas,
-- movimientos de dinero, distribuciones de utilidades, aportes de capital e
-- inversiones fijas. El stock queda en 0.
--
-- SE CONSERVA: productos, precios, almacenes, tiendas, cuentas contables,
-- usuarios, roles, negocios, socios, empleados, puestos de venta, tenedores
-- de dinero (money_holders) y TASAS DE CAMBIO (exchange_rates).

begin;

-- 1) Desbloquear guards de inmutabilidad (impiden borrar líneas de documentos
--    contabilizados/confirmados/recibidos/cerrados).
update public.journal_entries   set status = 'borrador' where status <> 'borrador';
update public.orders            set status = 'borrador' where status <> 'borrador';
update public.purchase_orders   set status = 'borrador' where status <> 'borrador';
update public.production_orders set status = 'borrador' where status <> 'borrador';
update public.payroll_runs      set status = 'borrador' where status <> 'borrador';

-- 2) Contabilidad
delete from public.journal_lines;
delete from public.journal_entries;

-- 3) Costeo FIFO
delete from public.inventory_lot_consumptions;
delete from public.inventory_lots;

-- 4) Cuadres (referencian ventas/remesas)
delete from public.daily_closures;
delete from public.remittance_closure_partner_lines;
delete from public.remittance_weekly_closures;

-- 5) Ventas (online_payments referencia orders)
delete from public.online_payments;
delete from public.order_lines;
delete from public.orders;

-- 6) Compras y producción
delete from public.purchase_order_lines;
delete from public.purchase_orders;
delete from public.production_orders;

-- 7) Movimientos de inventario (después de orders/production que los referencian)
delete from public.inventory_movement_lines;
delete from public.inventory_movements;

-- 8) Nómina y asistencia
delete from public.payroll_items;
delete from public.payroll_runs;
delete from public.attendance;

-- 9) Remesas y dinero (money_movements referencia remesas)
delete from public.money_movements;
delete from public.remittance_operations;

-- 10) Socios y capital
delete from public.profit_distribution_lines;
delete from public.profit_distributions;
delete from public.capital_contributions;
delete from public.fixed_assets;

-- 11) Stock a cero (conserva ubicaciones y mín/máx configurados)
update public.stock_locations set quantity = 0 where quantity <> 0;

-- 12) Reiniciar numeración de códigos
alter sequence public.sales_order_seq      restart with 1;
alter sequence public.purchase_order_seq   restart with 1;
alter sequence public.journal_entry_seq    restart with 1;
alter sequence public.remittance_seq       restart with 1;
alter sequence public.production_order_seq restart with 1;

commit;
