-- 0042_confirm_pos_order_usd.sql
-- confirm_pos_order versión USD funcional (reemplaza la de 0026).
--
-- Cambios respecto a 0026:
--   1. Exige tasa USD→CUP fresca (current_usd_rate_strict — bloquea si >3 días).
--   2. RECALCULA los precios server-side: unit_price = product_price_cup(
--      products.price × tasa). No se confía en el precio que mande el cliente;
--      el precio USD del producto es el único punto de verdad.
--   3. El FIFO acumula COGS en CUP y en USD (unit_cost_usd congelado del lote).
--   4. Congela en la orden: sale_rate (tasa usada), amount_usd (= total/tasa),
--      cogs_total (CUP histórico) y cogs_usd (costo real en dólares).
--
-- Idempotente. Aplicar después de 0041.

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
  v_cogs_usd  numeric := 0;
  v_rate      numeric;
  v_total     numeric;
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

  -- Tasa del día (bloquea si falta o tiene más de 3 días).
  v_rate := public.current_usd_rate_strict();

  -- Repreciar las líneas desde el precio USD del producto (anti-manipulación).
  for v_line in
    select ol.id, ol.product_id, p.price as price_usd
      from public.order_lines ol
      join public.products p on p.id = ol.product_id
     where ol.order_id = p_order_id
  loop
    if v_line.price_usd is null or v_line.price_usd <= 0 then
      raise exception 'El producto % no tiene precio USD definido; ponlo en el gestor antes de vender.', v_line.product_id;
    end if;
    update public.order_lines
       set unit_price     = public.product_price_cup(v_line.price_usd, v_rate),
           unit_price_usd = v_line.price_usd
     where id = v_line.id;
  end loop;

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

    -- Consumo FIFO con costo dual (CUP histórico + USD congelado del lote).
    v_remaining := v_line.quantity;
    for v_lot in
      select id, unit_cost, unit_cost_usd, qty_remaining from public.inventory_lots
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
        (lot_id, movement_id, product_id, warehouse_id, quantity, unit_cost, unit_cost_usd)
      values
        (v_lot.id, v_mov, v_line.product_id, v_order.warehouse_id, v_take,
         v_lot.unit_cost, coalesce(v_lot.unit_cost_usd, 0));
      v_cogs     := v_cogs     + v_take * v_lot.unit_cost;
      v_cogs_usd := v_cogs_usd + v_take * coalesce(v_lot.unit_cost_usd, 0);
      v_remaining := v_remaining - v_take;
    end loop;
  end loop;

  -- Total ya repreciado por el trigger de líneas.
  select coalesce(total_amount, 0) into v_total from public.orders where id = p_order_id;

  update public.orders
     set status       = 'confirmada',
         confirmed_by = v_user,
         confirmed_at = now(),
         movement_id  = v_mov,
         cogs_total   = round(v_cogs, 2),
         cogs_usd     = round(v_cogs_usd, 2),
         sale_rate    = v_rate,
         amount_usd   = round(v_total / v_rate, 2)
   where id = p_order_id;

  return v_mov;
end $$;

revoke all on function public.confirm_pos_order(uuid) from public;
grant execute on function public.confirm_pos_order(uuid) to authenticated;
