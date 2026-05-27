-- 0014_products_online_flag.sql
-- Marca por producto si se vende en la tienda online. La tabla products es de
-- martinez-global (migración 0001) pero el ERP también administra el catálogo;
-- esta bandera la controla el ERP y la respeta la tienda (listOnlineProducts).
-- Default true para no ocultar el catálogo existente. Idempotente.

alter table public.products add column if not exists online_visible boolean not null default true;

create index if not exists products_online_idx on public.products(online_visible) where online_visible = true;
