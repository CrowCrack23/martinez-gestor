-- 0038_products_nullable_store.sql
-- Productos sin tienda obligatoria (requisito del cliente: "que no estén
-- obligatoriamente en una tienda, con que estén en un almacén ya me sirve").
--
-- La tabla products es compartida con la tienda online (martinez-global):
-- un producto con store NULL nunca se muestra online (el gestor además
-- fuerza online_visible = false al guardarlo sin tienda).
--
-- DROP NOT NULL es idempotente (no falla si la columna ya es nullable).
-- Aplicar después de 0037.

alter table public.products alter column store drop not null;
alter table public.products alter column category drop not null;
