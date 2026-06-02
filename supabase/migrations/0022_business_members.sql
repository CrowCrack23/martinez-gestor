-- 0022_business_members.sql
-- Modelo "rol por negocio" (membresía). FASE 1: REMESAS.
--
-- Un usuario pertenece a uno o varios negocios y DENTRO de cada uno tiene un rol
-- (gestor/encargado_remesas/mensajero en remesas; vendedor/almacenero/… en una
-- tienda). `admin` sigue siendo global. Esta migración introduce el modelo y lo
-- aplica a REMESAS; el ERP web de tiendas sigue usando los roles globales
-- (user_roles) hasta una fase posterior.
--
-- Supersede las políticas de remesas de 0021 (las redefine por membresía).
-- Idempotente. Aplicar después de 0021.

-- ── 1) Roles nuevos ──────────────────────────────────────────────────────────
insert into public.roles (id, name, description) values
  ('gestor',            'Gestor',              'Capta y promociona clientes de remesas'),
  ('encargado_remesas', 'Encargado de remesas','Administra el negocio de remesas (tasas, asignaciones, todo)')
on conflict (id) do nothing;

-- ── 2) Membresías: rol de un usuario DENTRO de un negocio ────────────────────
create table if not exists public.business_members (
  user_id        uuid not null references public.app_users(id) on delete cascade,
  business_slug  text not null references public.businesses(slug) on update cascade on delete cascade,
  role_id        text not null references public.roles(id) on delete restrict,
  -- % de comisión del gestor sobre la comisión cobrada (solo aplica al rol gestor).
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  created_at     timestamptz not null default now(),
  primary key (user_id, business_slug, role_id)
);
create index if not exists business_members_business_idx on public.business_members(business_slug);
create index if not exists business_members_user_idx     on public.business_members(user_id);

alter table public.business_members enable row level security;

-- ── 3) Remesa: gestor que la trajo + comisión del gestor (snapshot) ──────────
alter table public.remittance_operations
  add column if not exists gestor_id uuid references public.app_users(id) on delete set null;
alter table public.remittance_operations
  add column if not exists gestor_commission_usd numeric(10,2) not null default 0
    check (gestor_commission_usd >= 0);
create index if not exists remittances_gestor_idx on public.remittance_operations(gestor_id);

-- ── 4) Helpers de membresía (security definer) ───────────────────────────────
create or replace function public.has_business_role(p_business text, p_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.business_members
     where user_id = public.app_user_id()
       and business_slug = p_business
       and role_id = p_role
  )
$$;

create or replace function public.is_remittance_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_admin() or public.has_business_role('remesas', 'encargado_remesas')
$$;

create or replace function public.is_remittance_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_business_role('remesas', 'gestor')
$$;

create or replace function public.is_remittance_courier()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_business_role('remesas', 'mensajero')
$$;

-- Redefine el helper de 0021 a membresía (encargado/admin).
create or replace function public.is_remittance_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_remittance_admin()
$$;

-- ── 5) GRANTs (self-contained: válido aunque 0021 no se haya aplicado) ───────
grant usage on schema public to anon, authenticated;
grant select on public.business_members to authenticated;
grant select, insert, update, delete on public.remittance_operations to authenticated;
grant select, insert, update, delete on public.exchange_rates         to authenticated;
grant usage on sequence public.remittance_seq to authenticated;

-- ── 6) RLS business_members: cada quien lee SUS membresías ───────────────────
drop policy if exists bm_select_self on public.business_members;
create policy bm_select_self on public.business_members
  for select to authenticated
  using (user_id = public.app_user_id());

-- ── 7) RLS remesas por rol de negocio ────────────────────────────────────────
alter table public.remittance_operations enable row level security;

drop policy if exists rem_select on public.remittance_operations;
create policy rem_select on public.remittance_operations
  for select to authenticated
  using (
    public.is_remittance_admin()
    or (public.is_remittance_gestor()  and (gestor_id = public.app_user_id() or created_by = public.app_user_id()))
    or (public.is_remittance_courier() and assigned_to = public.app_user_id())
  );

-- Crean: encargado (cualquiera) y gestor (las suyas). created_by debe ser uno mismo.
drop policy if exists rem_insert on public.remittance_operations;
create policy rem_insert on public.remittance_operations
  for insert to authenticated
  with check (
    (public.is_remittance_admin() or public.is_remittance_gestor())
    and (created_by = public.app_user_id() or created_by is null)
  );

drop policy if exists rem_update on public.remittance_operations;
create policy rem_update on public.remittance_operations
  for update to authenticated
  using (
    public.is_remittance_admin()
    or (public.is_remittance_gestor()  and (gestor_id = public.app_user_id() or created_by = public.app_user_id()))
    or (public.is_remittance_courier() and assigned_to = public.app_user_id())
  )
  with check (
    public.is_remittance_admin()
    or (public.is_remittance_gestor()  and (gestor_id = public.app_user_id() or created_by = public.app_user_id()))
    or (public.is_remittance_courier() and assigned_to = public.app_user_id())
  );

drop policy if exists rem_delete on public.remittance_operations;
create policy rem_delete on public.remittance_operations
  for delete to authenticated
  using (public.is_remittance_admin());

-- ── 8) RLS tasas: lectura para cualquier autenticado; escritura encargado/admin
alter table public.exchange_rates enable row level security;

drop policy if exists rate_select on public.exchange_rates;
create policy rate_select on public.exchange_rates
  for select to authenticated using (true);

drop policy if exists rate_insert on public.exchange_rates;
create policy rate_insert on public.exchange_rates
  for insert to authenticated with check (public.is_remittance_admin());

drop policy if exists rate_update on public.exchange_rates;
create policy rate_update on public.exchange_rates
  for update to authenticated using (public.is_remittance_admin()) with check (public.is_remittance_admin());

drop policy if exists rate_delete on public.exchange_rates;
create policy rate_delete on public.exchange_rates
  for delete to authenticated using (public.is_app_admin());
