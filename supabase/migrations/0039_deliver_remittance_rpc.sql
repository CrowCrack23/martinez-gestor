-- 0039_deliver_remittance_rpc.sql
-- Entrega de remesa desde la APK móvil (RPC security definer).
--
-- El web entrega remesas en TypeScript (lib/remittances.ts:payRemittance) con
-- la service_role key: calcula ganancia, genera el asiento y registra el
-- movimiento de dinero del mensajero. La APK opera con anon key + RLS, así
-- que esta función replica la RUTA SIMPLE del mensajero (entrega en CUP a la
-- misma tasa → diferencia de tasas 0; las entregas multi-moneda con tasa de
-- costo se siguen registrando desde el gestor web).
--
-- Qué hace (espejo del flujo TS):
--   1. Valida: remesa pendiente; quien llama es encargado/admin de remesas o
--      el mensajero asignado.
--   2. Marca entregada con delivery CUP por defecto y congela
--      profit_cup = commission_usd × exchange_rate.
--   3. Asiento borrador (best-effort, idempotente por ('remesa', id)) en el
--      negocio del origen (remesas_eeuu | remesas_europa):
--      Caja CUP (1110) DEBE ganancia / Comisiones remesas (4300) HABER.
--   4. Movimiento de dinero del mensajero (best-effort): si tiene tenedor
--      activo vinculado (money_holders.app_user_id), registra que ENTREGÓ el
--      efectivo (amount negativo, kind 'entrega').
--
-- Idempotente. Aplicar después de 0038 (requiere columnas de 0033 y tablas
-- de 0034; las cuentas 1110/4300 vienen de 0011).

create or replace function public.deliver_remittance(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user           uuid := public.app_user_id();
  v_rem            public.remittance_operations%rowtype;
  v_business       text;
  v_commission_cup numeric;
  v_entry          uuid;
  v_caja           uuid;
  v_comisiones     uuid;
  v_holder         uuid;
begin
  if v_user is null then
    raise exception 'No autenticado.';
  end if;

  select * into v_rem from public.remittance_operations where id = p_id for update;
  if not found then
    raise exception 'Remesa no encontrada.';
  end if;
  if v_rem.status <> 'pendiente' then
    raise exception 'No se puede marcar como entregada una remesa en estado %.', v_rem.status;
  end if;
  if not public.is_remittance_admin()
     and not (public.is_remittance_courier() and v_rem.assigned_to = v_user) then
    raise exception 'No autorizado: la remesa no está asignada a ti.';
  end if;

  v_commission_cup := round(v_rem.commission_usd * v_rem.exchange_rate, 2);
  v_business := case when v_rem.origin = 'europa' then 'remesas_europa' else 'remesas_eeuu' end;

  update public.remittance_operations
     set status            = 'entregada',
         paid_by           = v_user,
         paid_at           = now(),
         delivery_currency = 'CUP',
         delivery_amount   = v_rem.amount_cup,
         profit_cup        = v_commission_cup
   where id = p_id;

  -- Asiento contable (best-effort: si faltan cuentas no se aborta la entrega).
  begin
    if v_commission_cup > 0 and not exists (
      select 1 from public.journal_entries
       where reference_type = 'remesa' and reference_id = p_id::text
    ) then
      select id into v_caja       from public.accounts where code = '1110';
      select id into v_comisiones from public.accounts where code = '4300';
      if v_caja is not null and v_comisiones is not null then
        insert into public.journal_entries
          (entry_date, description, reference_type, reference_id, business, created_by)
        values
          (current_date, 'Remesa ' || v_rem.code || ' entregada', 'remesa', p_id::text, v_business, v_user)
        returning id into v_entry;
        insert into public.journal_lines (entry_id, account_id, debit, credit, description, position) values
          (v_entry, v_caja,       v_commission_cup, 0, 'Ganancia remesa ' || v_rem.code, 0),
          (v_entry, v_comisiones, 0, v_commission_cup, 'Comisión remesa ' || v_rem.code, 1);
      end if;
    end if;
  exception when others then
    null; -- el asiento lo respalda el gestor web si hiciera falta
  end;

  -- Movimiento de dinero del mensajero (best-effort).
  begin
    if v_rem.assigned_to is not null then
      select id into v_holder from public.money_holders
       where business_slug = v_business
         and app_user_id = v_rem.assigned_to
         and active
       limit 1;
      if v_holder is not null then
        insert into public.money_movements
          (business_slug, holder_id, amount, currency, kind, remittance_id, notes, created_by)
        values
          (v_business, v_holder, -v_rem.amount_cup, 'CUP', 'entrega', p_id,
           'Entrega remesa ' || v_rem.code, v_user);
      end if;
    end if;
  exception when others then
    null;
  end;
end $$;

revoke all on function public.deliver_remittance(uuid) from public;
grant execute on function public.deliver_remittance(uuid) to authenticated;
