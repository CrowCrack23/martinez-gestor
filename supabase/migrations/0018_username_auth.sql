-- 0018_username_auth.sql
-- Cambia el login de email → username.
-- Reemplaza la columna `email` de `app_users` por `username` (texto único, en
-- minúsculas). Hace backfill desde la parte local del email existente
-- (antes de la @), resuelve colisiones con un sufijo numérico, y elimina email.
-- Idempotente: el bloque solo corre mientras exista la columna `email`.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'email'
  ) then
    -- 1) Nueva columna
    alter table public.app_users add column if not exists username text;

    -- 2) Backfill desde la parte local del email
    update public.app_users
       set username = lower(split_part(email, '@', 1))
     where username is null or username = '';

    -- 3) Resolver colisiones (usuario, usuario1, usuario2, …)
    with d as (
      select id,
             row_number() over (partition by username order by created_at, id) - 1 as n
        from public.app_users
    )
    update public.app_users a
       set username = a.username || d.n::text
      from d
     where a.id = d.id and d.n > 0;

    -- 4) Restricciones
    alter table public.app_users alter column username set not null;
    create unique index if not exists app_users_username_key on public.app_users(username);

    -- 5) Eliminar email
    alter table public.app_users drop column email;
  end if;
end $$;
