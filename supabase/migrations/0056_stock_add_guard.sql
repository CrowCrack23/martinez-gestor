-- 0056_stock_add_guard.sql
-- Arregla _stock_add: rechazar cualquier salida/transferencia que deje el stock
-- NEGATIVO, incluido el caso de un producto que NO existe en el almacén origen.
--
-- Bug: la versión anterior insertaba greatest(p_delta, 0) al crear la fila, así
-- que un delta negativo sobre un (producto, almacén) inexistente insertaba 0 en
-- vez de fallar → se podía "transferir" un producto que no estaba en el origen,
-- creando en el destino un lote SIN COSTO. Ahora se comprueba el saldo antes de
-- aplicar y se lanza un error claro.
--
-- Idempotente. Aplicar después de 0055 (mantiene numeric de 0047).

create or replace function public._stock_add(p_product text, p_warehouse uuid, p_delta numeric)
returns void
language plpgsql
as $$
declare
  v_current numeric;
begin
  select quantity into v_current
    from public.stock_locations
   where product_id = p_product and warehouse_id = p_warehouse;
  v_current := coalesce(v_current, 0);

  if v_current + p_delta < 0 then
    raise exception 'Stock insuficiente para producto % en almacén % (hay %, se intentó mover %).',
      p_product, p_warehouse, v_current, -p_delta;
  end if;

  insert into public.stock_locations (product_id, warehouse_id, quantity, updated_at)
  values (p_product, p_warehouse, v_current + p_delta, now())
  on conflict (product_id, warehouse_id) do update
    set quantity = public.stock_locations.quantity + p_delta,
        updated_at = now();
end $$;
