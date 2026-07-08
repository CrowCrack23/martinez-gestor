-- 0057_product_is_insumo.sql
-- Clasificación de productos: insumo vs producto terminado.
--   is_insumo = true  → materia prima / producto intermedio. Si el centro lo
--                       produce, se queda en el almacén del centro a COSTO (sin
--                       margen), listo para usarse en otra producción.
--   is_insumo = false → producto terminado (por defecto). Al producirlo en el
--                       centro pasa al almacén central con el precio de
--                       transferencia (costo + 33% de utilidad).
--
-- La tabla products se comparte con la tienda online (martinez-global); la
-- columna es opcional con default false, así que no afecta al catálogo web.
-- Idempotente. Aplicar después de 0056.

alter table public.products
  add column if not exists is_insumo boolean not null default false;
