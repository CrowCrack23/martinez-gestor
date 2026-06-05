-- 0029_partners.sql
-- Socios por negocio (MIPYME y futuros) + configuración del % de crecimiento.
--
-- Los socios NO son usuarios del sistema (solo el cliente entra); por eso van
-- en su propia tabla y no en business_members (que es para roles de usuarios
-- reales, p.ej. gestores de remesas). app_user_id queda opcional para marcar
-- al cliente-socio. Regla de negocio (validada en lib/partners.ts):
-- Σ profit_pct(socios activos) + business_settings.growth_pct = 100.
--
-- Idempotente. Aplicar después de 0028.

create table if not exists public.business_partners (
  id            uuid primary key default gen_random_uuid(),
  business_slug text not null references public.businesses(slug) on update cascade on delete restrict,
  name          text not null,
  -- % FIJO de la ganancia mensual que recibe el socio.
  profit_pct    numeric(5,2) not null default 0 check (profit_pct >= 0 and profit_pct <= 100),
  app_user_id   uuid references public.app_users(id) on delete set null,
  active        boolean not null default true,
  notes         text not null default '',
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists business_partners_business_idx on public.business_partners(business_slug);

drop trigger if exists tg_business_partners_updated_at on public.business_partners;
create trigger tg_business_partners_updated_at
  before update on public.business_partners
  for each row execute function public.tg_set_updated_at();

alter table public.business_partners enable row level security;

-- ── % de crecimiento de la empresa (modificable por el cliente) ────────
create table if not exists public.business_settings (
  business_slug text primary key references public.businesses(slug) on update cascade on delete cascade,
  -- % de la ganancia mensual que se queda en la empresa (reinversión).
  growth_pct    numeric(5,2) not null default 0 check (growth_pct >= 0 and growth_pct <= 100),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users(id) on delete set null
);

alter table public.business_settings enable row level security;
