-- 0037_account_currency.sql
-- Doble moneda (requisito del cliente: "toda la contabilidad en USD y CUP,
-- moneda rectora el dólar").
--
-- El libro sigue denominado en CUP, pero cada cuenta declara su moneda
-- nativa: 1120 Caja USD guarda números en USD (como hasta ahora). Los
-- reportes convierten con la última tasa de exchange_rates para mostrar
-- totales en CUP y su equivalente USD. NO se convierten saldos históricos.
--
-- También se crea la cuenta 4900 'Otros ingresos' para los movimientos
-- manuales de ingreso desde /capital (los gastos usan la 5400 existente).
--
-- Idempotente. Aplicar después de 0036.

alter table public.accounts
  add column if not exists currency text not null default 'CUP'
  check (currency in ('CUP','USD','EUR'));

update public.accounts set currency = 'USD' where code = '1120' and currency <> 'USD';

insert into public.accounts (code, name, type) values
  ('4900','Otros ingresos','ingreso')
on conflict (code) do nothing;
