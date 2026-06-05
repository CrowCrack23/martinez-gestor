-- 0034_money_holders.sql
-- Tenedores de dinero y deudores de los negocios de remesas.
--
-- Requisito del cliente: ver en todo momento cuánto dinero hay ALLÁ
-- (EE.UU./Europa) y cuánto ACÁ (Cuba), y QUIÉN lo tiene: mensajeros con
-- efectivo pendiente de rendir, deudores que no han pagado, cajas, etc.
--
-- Modelo: holders (personas/lugares) + movimientos con signo (+ entra al
-- holder, − sale). Saldo del holder = Σ movimientos por moneda. El saldo de
-- un deudor representa lo que DEBE al negocio. Al entregar una remesa en
-- efectivo, lib/remittances.ts inserta automáticamente un movimiento
-- 'entrega' al holder del mensajero (si existe uno vinculado por app_user_id).
--
-- Idempotente. Aplicar después de 0033.

create table if not exists public.money_holders (
  id            uuid primary key default gen_random_uuid(),
  business_slug text not null references public.businesses(slug) on update cascade on delete restrict,
  name          text not null,
  kind          text not null default 'otro' check (kind in ('mensajero','deudor','socio','caja','otro')),
  app_user_id   uuid references public.app_users(id) on delete set null,
  location      text not null default 'aca' check (location in ('alla','aca')),
  active        boolean not null default true,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists money_holders_business_idx on public.money_holders(business_slug);

create table if not exists public.money_movements (
  id            uuid primary key default gen_random_uuid(),
  business_slug text not null references public.businesses(slug) on update cascade on delete restrict,
  holder_id     uuid not null references public.money_holders(id) on delete restrict,
  -- + el holder recibe dinero del negocio; − el holder lo devuelve/paga.
  amount        numeric(14,2) not null,
  currency      text not null default 'CUP' check (currency in ('CUP','USD','EUR')),
  kind          text not null default 'ajuste' check (kind in ('entrega','cobro','ajuste','liquidacion','deuda')),
  remittance_id uuid references public.remittance_operations(id) on delete set null,
  occurred_at   date not null default (now()::date),
  notes         text not null default '',
  created_by    uuid references public.app_users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists money_movements_holder_idx on public.money_movements(holder_id, occurred_at desc);
create index if not exists money_movements_business_idx on public.money_movements(business_slug);

-- Solo el web (service_role) las usa por ahora; la APK no necesita GRANTs.
alter table public.money_holders enable row level security;
alter table public.money_movements enable row level security;
