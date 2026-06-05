-- 0036_product_prices.sql
-- Precios de producto por moneda.
--
-- products.price sigue siendo el precio USD del catálogo online (martinez-
-- global). Esta tabla guarda los precios de venta del gestor por moneda
-- (CUP para tiendas físicas/puntos de venta, USD/EUR si se cobra en divisa).
-- La UI de ventas sugiere el precio CUP; la APK puede leerla (grant select)
-- para mostrar precios a los vendedores.
--
-- Idempotente. Aplicar después de 0035.

create table if not exists public.product_prices (
  -- products.id es text (catálogo de martinez-global), no uuid.
  product_id text not null references public.products(id) on delete cascade,
  currency   text not null check (currency in ('CUP','USD','EUR')),
  price      numeric(14,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, currency)
);

alter table public.product_prices enable row level security;

-- La APK (vendedores autenticados) necesita leer los precios.
grant select on public.product_prices to authenticated;
drop policy if exists pp_select_auth on public.product_prices;
create policy pp_select_auth on public.product_prices for select to authenticated using (true);
