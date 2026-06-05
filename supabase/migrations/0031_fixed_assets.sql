-- 0031_fixed_assets.sql
-- Infraestructura (inversión fija) por negocio + cuentas contables nuevas.
--
-- Requisito MIPYME: el capital debe distinguir "dinero en movimiento"
-- (insumos, producto, mercancía, efectivo) de la "infraestructura" (inversión
-- fija que no se mueve). Registro simple sin depreciación. Al registrar un
-- activo se genera (best-effort, lib/capital.ts) el asiento:
-- Infraestructura (1500) DEBE / Caja CUP (1110) HABER, reference_type
-- 'activo_fijo'.
--
-- Idempotente. Aplicar después de 0030.

create table if not exists public.fixed_assets (
  id               uuid primary key default gen_random_uuid(),
  business_slug    text not null references public.businesses(slug) on update cascade on delete restrict,
  name             text not null,
  amount           numeric(14,2) not null check (amount > 0),
  acquired_at      date not null default current_date,
  notes            text not null default '',
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  created_by       uuid references public.app_users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists fixed_assets_business_idx
  on public.fixed_assets(business_slug, acquired_at desc);

alter table public.fixed_assets enable row level security;

-- Cuentas: activo fijo y retiros de socios (reparto de ganancias).
insert into public.accounts (code, name, type) values
  ('1500', 'Infraestructura', 'activo'),
  ('3300', 'Retiros de socios', 'patrimonio')
on conflict (code) do nothing;
