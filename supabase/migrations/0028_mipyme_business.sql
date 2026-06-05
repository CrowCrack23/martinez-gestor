-- 0028_mipyme_business.sql
-- Fase 2 (MIPYME): alta del negocio 'mipyme' y vínculo almacén→negocio.
--
-- 1. La FK warehouses.store_slug apuntaba a stores(slug) (tabla de la tienda
--    online, repo martinez-global). La reestructura es POR NEGOCIOS, así que
--    se re-apunta a businesses(slug): todos los slugs presentes en warehouses
--    ya existen en businesses (seed de 0018), y MIPYME no debe ensuciar la
--    tabla stores (aparecería en el catálogo web).
-- 2. Se asocian los almacenes MIPYME existentes (estaban con store_slug null
--    y el centro de elaboración mal asignado a 'comida').
-- 3. Los mercaditos pasan a type 'punto_venta' para usar la APK y los cuadres
--    de la fase 1 (0023–0027).
--
-- Idempotente. Aplicar después de 0027.

-- ── Negocio ────────────────────────────────────────────────────────────
insert into public.businesses (slug, label, code_prefix, kind, active, position)
values ('mipyme', 'MIPYME', 'MIPYME', 'tienda', true, 10)
on conflict (slug) do nothing;

-- ── Re-apuntar FK warehouses.store_slug → businesses(slug) ─────────────
do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_class ft on ft.oid = c.confrelid
    where t.relname = 'warehouses'
      and c.conname = 'warehouses_store_slug_fkey'
      and ft.relname = 'stores'
  ) then
    alter table public.warehouses drop constraint warehouses_store_slug_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'warehouses' and c.conname = 'warehouses_store_slug_fkey'
  ) then
    alter table public.warehouses
      add constraint warehouses_store_slug_fkey
      foreign key (store_slug) references public.businesses(slug)
      on update cascade on delete set null;
  end if;
end $$;

-- ── Asociar almacenes MIPYME (ids verificados en producción) ───────────
update public.warehouses set store_slug = 'mipyme'
where id in (
  '3bb7cca8-2707-4cf9-86ff-f0ea390850d2', -- ALM-CENTRAL MIPYME (almacen_central)
  'b87e6272-7381-41b0-abdc-6c465fc75a3f'  -- centro de elaboracion (estaba en 'comida')
) and (store_slug is distinct from 'mipyme');

-- Mercaditos: negocio + tipo punto de venta (cuadres/APK de fase 1).
update public.warehouses set store_slug = 'mipyme', type = 'punto_venta'
where id in (
  'e65271f7-0f33-4ff0-a77b-cdd7d36ea109', -- MERCADITO TULIPAN
  'bfd1ed3a-b093-4ad5-8eb6-e77e63994b9b', -- MERCADITO CALLE ARGUELLES
  '6252d4e2-5559-4354-99ac-a1f4d471210f'  -- PUNTO DE VENTA HERMANAS GIRALT
) and (store_slug is distinct from 'mipyme' or type <> 'punto_venta');
