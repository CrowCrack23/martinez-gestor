-- 0047_decimal_quantities.sql
-- Permite CANTIDADES con decimales en TODO el inventario (insumos, producción,
-- compras, ventas). Antes las cantidades eran `integer`; ahora numeric(18,3),
-- coherente con que insumos como harina/aceite se midan con coma.
--
-- Toca columnas de cantidad + la función _stock_add (recibía integer y truncaba
-- los decimales) + el RPC confirm_pos_order de la APK (variables integer que
-- también truncaban). Las columnas de costo/precio unitario ya son numeric(18,6)
-- desde 0045; aquí solo cambian las cantidades.
--
-- Ampliar/cambiar a numeric preserva los valores existentes. Idempotente:
-- alter column type es repetible sin efecto si ya está en numeric.

-- ── Cantidades de stock y movimientos ────────────────────────────────────────
alter table public.stock_locations
  alter column quantity type numeric(18,3);

alter table public.inventory_movement_lines
  alter column quantity type numeric(18,3);

alter table public.inventory_lots
  alter column qty_received  type numeric(18,3),
  alter column qty_remaining type numeric(18,3);

alter table public.inventory_lot_consumptions
  alter column quantity type numeric(18,3);

-- ── Líneas de compra (line_total es generada quantity*unit_cost) ──────────────
alter table public.purchase_order_lines drop column if exists line_total;
alter table public.purchase_order_lines
  alter column quantity type numeric(18,3);
alter table public.purchase_order_lines
  add column if not exists line_total numeric(20,6)
  generated always as (quantity * unit_cost) stored;

-- ── Líneas de venta (line_total es generada quantity*unit_price) ──────────────
alter table public.order_lines drop column if exists line_total;
alter table public.order_lines
  alter column quantity type numeric(18,3);
alter table public.order_lines
  add column if not exists line_total numeric(20,6)
  generated always as (quantity * unit_price) stored;

-- ── _stock_add con delta numeric (antes integer → truncaba los decimales) ─────
-- Se elimina la versión integer para no dejar un overload ambiguo; el trigger
-- apply_inventory_movement_line resuelve la versión numeric (NEW.quantity es
-- numeric tras los alter de arriba).
drop function if exists public._stock_add(text, uuid, integer);
create or replace function public._stock_add(p_product text, p_warehouse uuid, p_delta numeric)
returns void
language plpgsql
as $$
begin
  insert into public.stock_locations (product_id, warehouse_id, quantity, updated_at)
  values (p_product, p_warehouse, greatest(p_delta, 0), now())
  on conflict (product_id, warehouse_id) do update
    set quantity = public.stock_locations.quantity + p_delta,
        updated_at = now();

  -- Guard rail: nunca dejar stock negativo (check de tabla también lo impide).
  if (select quantity from public.stock_locations
        where product_id = p_product and warehouse_id = p_warehouse) < 0 then
    raise exception 'Stock insuficiente para producto % en almacén %', p_product, p_warehouse;
  end if;
end $$;

-- ── RPC confirm_pos_order (APK): cantidades numeric ──────────────────────────
-- Reemplaza la versión de 0042 cambiando v_remaining/v_take de integer a numeric
-- para no truncar cantidades con decimales vendidas desde el punto de venta.
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
  v_remaining numeric;
  v_take      numeric;
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
