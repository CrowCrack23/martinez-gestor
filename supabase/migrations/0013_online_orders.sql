-- 0013_online_orders.sql
-- Pagos online con pasarela (PagueloFácil) para la tienda martinez-global.
-- Añade seguimiento de pago a `orders` y una tabla `online_payments` que aísla
-- la operativa de la pasarela. El cliente paga en USD; la orden del ERP se
-- registra en CUP (convertida con la tasa de exchange_rates) para mantener los
-- libros coherentes; el USD cobrado se guarda en online_payments.amount_usd.
-- Idempotente. Aplicar en el SQL Editor de Supabase después de 0012.

-- ── Seguimiento de pago en orders ────────────────────────────────────────────

alter table public.orders add column if not exists payment_status   text not null default 'no_aplica';
alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_ref      text;
alter table public.orders add column if not exists amount_charged   numeric(14,2);
alter table public.orders add column if not exists charge_currency  text;

-- payment_status: 'no_aplica' (ventas no-online) | 'pendiente' | 'pagado' | 'fallido'
do $$ begin
  alter table public.orders add constraint orders_payment_status_chk
    check (payment_status in ('no_aplica','pendiente','pagado','fallido'));
exception when duplicate_object then null; end $$;

create index if not exists orders_payment_status_idx on public.orders(payment_status);

-- ── Pagos de pasarela ────────────────────────────────────────────────────────

create table if not exists public.online_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  provider    text not null default 'paguelofacil',
  link_code   text,                       -- código del enlace de pago (LK-...)
  oper_code   text,                       -- codOper devuelto por el webhook
  amount_usd  numeric(14,2) not null,     -- monto cobrado al cliente en USD
  nonce       text not null,              -- secreto anti-suplantación (se valida en el webhook)
  status      text not null default 'pendiente',  -- pendiente | pagado | fallido
  raw         jsonb,                       -- payload crudo del webhook (auditoría)
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists online_payments_order_idx on public.online_payments(order_id);
create index if not exists online_payments_link_idx  on public.online_payments(link_code);
create index if not exists online_payments_oper_idx  on public.online_payments(oper_code);

drop trigger if exists tg_online_payments_updated_at on public.online_payments;
create trigger tg_online_payments_updated_at before update on public.online_payments
  for each row execute function public.tg_set_updated_at();

alter table public.online_payments enable row level security;
