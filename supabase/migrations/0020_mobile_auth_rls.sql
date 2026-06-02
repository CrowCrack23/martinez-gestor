-- 0020_mobile_auth_rls.sql
-- Puente entre Supabase Auth (auth.users) y el modelo propio (app_users), para
-- la app móvil de trabajadores (martinez-apk). Los trabajadores inician sesión
-- con Supabase Auth y la app habla DIRECTO a Supabase con la anon key; las
-- políticas RLS limitan qué puede ver/hacer cada uno según su rol.
--
-- El ERP web NO se ve afectado: sigue usando la service_role key (que bypassa
-- RLS) y su login propio (cookie HMAC + scrypt sobre app_users.password_hash).
--
-- Esta migración solo añade el puente y la RLS de IDENTIDAD (cada worker lee su
-- propio usuario/roles/negocios). La RLS de cada módulo (remesas, productos,
-- inventario, ventas) se añade en migraciones posteriores, una por módulo.
--
-- Idempotente. Aplicar después de 0019.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Columna puente: vincula un usuario de Supabase Auth con su app_user.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.app_users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

create index if not exists app_users_auth_user_idx on public.app_users(auth_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Helpers (security definer: corren como owner y por tanto pueden leer
--    app_users/user_roles sin chocar con la RLS, evitando recursión de políticas).
-- ─────────────────────────────────────────────────────────────────────────────

-- app_user_id(): id de app_users del usuario autenticado en Supabase Auth (o null).
create or replace function public.app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.app_users
   where auth_user_id = auth.uid() and active
   limit 1
$$;

-- has_app_role(role): ¿el usuario autenticado tiene ese rol?
create or replace function public.has_app_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
     where ur.user_id = public.app_user_id() and ur.role_id = p_role
  )
$$;

-- is_app_admin(): atajo para el rol admin.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.has_app_role('admin') $$;

-- app_user_businesses(): tiendas asignadas al usuario (para alcance por negocio).
create or replace function public.app_user_businesses()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select store_slug from public.user_businesses where user_id = public.app_user_id()
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) GRANTs: la anon key opera como rol `authenticated` tras el login. Sin estos
--    grants la RLS ni siquiera se evalúa (faltaría el privilegio de tabla).
-- ─────────────────────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated;
grant select on public.app_users, public.user_roles, public.user_businesses, public.roles
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS de identidad: cada worker solo lee SU propia información.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.app_users        enable row level security;
alter table public.user_roles        enable row level security;
alter table public.user_businesses   enable row level security;
alter table public.roles             enable row level security;

drop policy if exists app_users_self_select on public.app_users;
create policy app_users_self_select on public.app_users
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists user_roles_self_select on public.user_roles;
create policy user_roles_self_select on public.user_roles
  for select to authenticated
  using (user_id = public.app_user_id());

drop policy if exists user_businesses_self_select on public.user_businesses;
create policy user_businesses_self_select on public.user_businesses
  for select to authenticated
  using (user_id = public.app_user_id());

-- Catálogo de roles: legible por cualquier autenticado (solo para etiquetas).
drop policy if exists roles_authenticated_select on public.roles;
create policy roles_authenticated_select on public.roles
  for select to authenticated
  using (true);
