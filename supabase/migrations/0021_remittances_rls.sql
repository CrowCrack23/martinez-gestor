-- 0021_remittances_rls.sql
-- RLS para que la app móvil (martinez-apk) opere REMESAS directo contra Supabase
-- con la anon key. El ERP web sigue usando service_role (bypassa RLS).
--
-- Roles que gestionan remesas a pleno ("manager"): admin, vendedor, contador
-- (igual que en el ERP web). El rol `mensajero` se cubre en una migración
-- posterior (solo ve/opera las remesas asignadas a él).
--
-- Idempotente. Aplicar después de 0020.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: ¿el usuario autenticado gestiona remesas?
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.is_remittance_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
      or public.has_app_role('vendedor')
      or public.has_app_role('contador')
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTs (la RLS no se evalúa sin privilegio de tabla). El INSERT de una remesa
-- usa el default `next_remittance_code()` → la secuencia necesita USAGE.
-- ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.remittance_operations to authenticated;
grant select, insert, update, delete on public.exchange_rates        to authenticated;
grant usage on sequence public.remittance_seq to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- remittance_operations
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.remittance_operations enable row level security;

drop policy if exists rem_select on public.remittance_operations;
create policy rem_select on public.remittance_operations
  for select to authenticated
  using (public.is_remittance_manager());

drop policy if exists rem_insert on public.remittance_operations;
create policy rem_insert on public.remittance_operations
  for insert to authenticated
  with check (
    public.is_remittance_manager()
    and (created_by = public.app_user_id() or created_by is null)
  );

drop policy if exists rem_update on public.remittance_operations;
create policy rem_update on public.remittance_operations
  for update to authenticated
  using (public.is_remittance_manager())
  with check (public.is_remittance_manager());

drop policy if exists rem_delete on public.remittance_operations;
create policy rem_delete on public.remittance_operations
  for delete to authenticated
  using (public.is_app_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- exchange_rates  (lectura para cualquier autenticado; escritura solo manager)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.exchange_rates enable row level security;

drop policy if exists rate_select on public.exchange_rates;
create policy rate_select on public.exchange_rates
  for select to authenticated
  using (true);

drop policy if exists rate_insert on public.exchange_rates;
create policy rate_insert on public.exchange_rates
  for insert to authenticated
  with check (public.is_remittance_manager());

drop policy if exists rate_update on public.exchange_rates;
create policy rate_update on public.exchange_rates
  for update to authenticated
  using (public.is_remittance_manager())
  with check (public.is_remittance_manager());

drop policy if exists rate_delete on public.exchange_rates;
create policy rate_delete on public.exchange_rates
  for delete to authenticated
  using (public.is_app_admin());
