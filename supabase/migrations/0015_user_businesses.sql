-- 0015_user_businesses.sql
-- Alcance por negocio. Un "negocio" es una tienda (stores: ropa, motos, comida,
-- intimo). Cada usuario se asigna a una o varias tiendas; sus consultas de
-- ventas, inventario, productos, compras y contabilidad se limitan a ellas.
-- El rol `admin` ve todos los negocios (no necesita asignaciones).
-- Las remesas NO se filtran por negocio (módulo aparte, sin tienda/stock).
-- Idempotente. Aplicar después de 0014.

create table if not exists public.user_businesses (
  user_id    uuid not null references public.app_users(id) on delete cascade,
  store_slug text not null references public.stores(slug) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_slug)
);

create index if not exists user_businesses_store_idx on public.user_businesses(store_slug);

alter table public.user_businesses enable row level security;

-- Etiqueta el asiento contable con el negocio (tienda) al que pertenece, para
-- poder filtrar la contabilidad por negocio. Null = asiento general/consolidado.
alter table public.journal_entries
  add column if not exists business text references public.stores(slug) on update cascade on delete set null;

create index if not exists journal_entries_business_idx on public.journal_entries(business);
