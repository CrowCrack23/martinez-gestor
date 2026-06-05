-- 0026_confirm_pos_order_rpc.sql
-- Confirmación de venta desde la APK móvil (RPC security definer).
--
-- El flujo web confirma ventas en TypeScript (lib/sales.ts:confirmOrder →
-- lib/inventory.ts:createMovement → lib/costing.ts:consumeFIFO) con la
-- service_role key. La APK opera con la anon key + RLS, así que esta función
-- replica esa misma lógica en SQL y corre como definer: el vendedor vende y
-- el stock baja al instante.
--
-- Qué hace (espejo fiel del flujo TS):
--   1. Valida: orden en borrador, con líneas, del punto de venta del vendedor.
--   2. Crea inventory_movements type='salida' + líneas (el trigger
--      apply_inventory_movement_line descuenta stock_locations y aborta si no
--      hay stock suficiente — misma garantía que el web).
--   3. Consume lotes FIFO (más antiguo primero) registrando
--      inventory_lot_consumptions y acumulando el COGS.
--   4. Si la venta es en USD, fija sale_rate (tasa del día si falta) y deriva
--      amount_usd = total_amount / sale_rate.
--   5. Marca la orden confirmada con movement_id y cogs_total.
--
-- El asiento contable de la venta NO se genera aquí (es best-effort en el
-- web): lo respalda confirmDailyClosure (lib/closures.ts), que al confirmar el
-- cuadre del día genera los asientos de venta que falten (idempotente por
-- reference_type/reference_id).
--
-- Idempotente. Aplicar después de 0025 (usa point_of_sale_staff de 0023 y
-- columnas de 0024).

-- ── Helpers de membresía del punto de venta ─────────────────────────────────
create or replace function public.app_user_pos_warehouses()
returns setof uuid language sql stable security definer set search_path = public as $$
  select warehouse_id from public.point_of_sale_staff
   where user_id = public.app_user_id() and active
$$;

create or replace function public.is_pos_seller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.point_of_sale_staff
     where user_id = public.app_user_id() and active
  )
$$;

-- ── RPC: confirmar venta del punto ───────────────────────────────────────────
create or replace function public.confirm_pos_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := public.app_user_id();
  v_order public.orders%rowtype;
  v_mov   uuid;
  v_line  record;
  v_lot   record;
  v_remaining integer;
  v_take      integer;
  v_cogs      numeric := 0;
  v_rate      numeric;
  v_amount_usd numeric;
begin
  if v_user is null then
    raise exception 'No autenticado.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Orden no encontrada.';
  end if;
  if v_order.status <> 'borrador' then
    raise exception 'No se puede confirmar una orden en estado %.', v_order.status;
  end if;
  if not public.is_app_admin()
     and v_order.warehouse_id not in (select public.app_user_pos_warehouses()) then
    raise exception 'No autorizado: la orden no pertenece a tu punto de venta.';
  end if;
  if not exists (select 1 from public.order_lines where order_id = p_order_id) then
    raise exception 'La orden no tiene líneas.';
  end if;

  -- Movimiento de salida; el trigger descuenta stock (y aborta si falta).
  insert into public.inventory_movements
    (type, warehouse_from, warehouse_to, reference_type, reference_id, user_id, notes)
  values
    ('salida', v_order.warehouse_id, null, 'venta', p_order_id::text, v_user,
     'Venta ' || v_order.code || case when v_order.reference <> '' then ' — ref. ' || v_order.reference else '' end)
  returning id into v_mov;

  for v_line in
    select product_id, quantity from public.order_lines
     where order_id = p_order_id order by position
  loop
    insert into public.inventory_movement_lines (movement_id, product_id, quantity)
    values (v_mov, v_line.product_id, v_line.quantity);

    -- Consumo FIFO (espejo de lib/costing.ts:consumeFIFO).
    v_remaining := v_line.quantity;
    for v_lot in
      select id, unit_cost, qty_remaining from public.inventory_lots
       where product_id = v_line.product_id
         and warehouse_id = v_order.warehouse_id
         and qty_remaining > 0
       order by received_at asc, created_at asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_lot.qty_remaining);
      update public.inventory_lots
         set qty_remaining = qty_remaining - v_take
       where id = v_lot.id;
      insert into public.inventory_lot_consumptions
        (lot_id, movement_id, product_id, warehouse_id, quantity, unit_cost)
      values
        (v_lot.id, v_mov, v_line.product_id, v_order.warehouse_id, v_take, v_lot.unit_cost);
      v_cogs := v_cogs + v_take * v_lot.unit_cost;
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;

  -- Venta en USD: snapshot de la tasa del día y monto cobrado en dólares.
  v_rate := v_order.sale_rate;
  v_amount_usd := v_order.amount_usd;
  if v_order.currency = 'USD' then
    if v_rate is null then
      select rate into v_rate from public.exchange_rates
       where currency_from = 'USD' and currency_to = 'CUP'
       order by day desc limit 1;
      if v_rate is null then
        raise exception 'No hay tasa USD→CUP registrada; registra la tasa del día antes de vender en USD.';
      end if;
    end if;
    select round(coalesce(total_amount, 0) / v_rate, 2) into v_amount_usd
      from public.orders where id = p_order_id;
  end if;

  update public.orders
     set status       = 'confirmada',
         confirmed_by = v_user,
         confirmed_at = now(),
         movement_id  = v_mov,
         cogs_total   = round(v_cogs, 2),
         sale_rate    = v_rate,
         amount_usd   = v_amount_usd
   where id = p_order_id;

  return v_mov;
end $$;

revoke all on function public.confirm_pos_order(uuid) from public;
grant execute on function public.confirm_pos_order(uuid) to authenticated;
