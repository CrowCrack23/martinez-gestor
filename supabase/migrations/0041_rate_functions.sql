-- 0041_rate_functions.sql
-- Tasa USD→CUP del día con bloqueo por tasa vieja + precio CUP de venta.
--
-- Regla del negocio (decisión del dueño): la tasa se registra a mano cada día
-- (/remesas/tasas). Si la última tasa tiene más de RATE_STALE_DAYS (3) días,
-- las operaciones de venta/compra se BLOQUEAN hasta registrar una nueva.
-- Entre 1 y 3 días se permite operar (la UI avisa).
--
-- El precio CUP de venta se calcula desde el precio USD del producto:
--   precio_cup = ceil(price_usd × tasa / 5) × 5   (múltiplo de 5 hacia arriba)
--
-- Idempotente. Aplicar después de 0040.

-- Última tasa USD→CUP registrada (sin bloqueo).
create or replace function public.current_usd_rate()
returns table (rate numeric, day date)
language sql stable
set search_path = public
as $$
  select rate, day from public.exchange_rates
   where currency_from = 'USD' and currency_to = 'CUP'
   order by day desc limit 1
$$;

-- Última tasa, con bloqueo si falta o tiene más de 3 días.
create or replace function public.current_usd_rate_strict()
returns numeric
language plpgsql stable
set search_path = public
as $$
declare
  v_rate numeric;
  v_day  date;
begin
  select r.rate, r.day into v_rate, v_day from public.current_usd_rate() r;
  if v_rate is null then
    raise exception 'No hay tasa USD→CUP registrada. Registra la tasa del día en /remesas/tasas.';
  end if;
  if v_day < current_date - 3 then
    raise exception 'La última tasa USD→CUP es del % (más de 3 días). Registra la tasa del día en /remesas/tasas.', v_day;
  end if;
  return v_rate;
end $$;

-- Precio de venta en CUP desde el precio USD: múltiplo de 5 hacia arriba.
create or replace function public.product_price_cup(p_usd numeric, p_rate numeric)
returns numeric
language sql immutable
as $$
  select ceil(p_usd * p_rate / 5) * 5
$$;

revoke all on function public.current_usd_rate() from public;
revoke all on function public.current_usd_rate_strict() from public;
revoke all on function public.product_price_cup(numeric, numeric) from public;
grant execute on function public.current_usd_rate() to authenticated, service_role;
grant execute on function public.current_usd_rate_strict() to authenticated, service_role;
grant execute on function public.product_price_cup(numeric, numeric) to authenticated, service_role;
