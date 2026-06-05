import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { generateRemittanceEntry } from "./auto-accounting";
import type { Database, RemittanceStatus, RemittancePayoutMethod, RemittanceOrigin, DeliveryCurrency } from "./supabase-types";

const TAG = "remittances";
const TAG_RATES = "exchange_rates";
function bust() { revalidateTag(TAG, "max"); }
function bustRates() { revalidateTag(TAG_RATES, "max"); }

export type Remittance = Database["public"]["Tables"]["remittance_operations"]["Row"];
export type ExchangeRate = Database["public"]["Tables"]["exchange_rates"]["Row"];

export const listRemittances = unstable_cache(
  async (filter?: { status?: RemittanceStatus; origin?: RemittanceOrigin; assignedTo?: string }): Promise<Remittance[]> => {
    const sb = getSupabase();
    let q = sb.from("remittance_operations").select("*").order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.origin) q = q.eq("origin", filter.origin);
    // assignedTo: limitar a las remesas del mensajero.
    if (filter?.assignedTo) q = q.eq("assigned_to", filter.assignedTo);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r) => ({
      ...r,
      amount_usd: Number(r.amount_usd),
      amount_cup: Number(r.amount_cup),
      exchange_rate: Number(r.exchange_rate),
      commission_usd: Number(r.commission_usd),
    }));
  },
  ["remittances_list"], { revalidate: 20, tags: [TAG] },
);

export const getRemittance = unstable_cache(
  async (id: string): Promise<Remittance | null> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("remittance_operations").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...data,
      amount_usd: Number(data.amount_usd),
      amount_cup: Number(data.amount_cup),
      exchange_rate: Number(data.exchange_rate),
      commission_usd: Number(data.commission_usd),
    };
  },
  ["remittance_by_id"], { revalidate: 20, tags: [TAG] },
);

export async function createRemittance(input: {
  sender_name: string; sender_phone: string;
  beneficiary_name: string; beneficiary_phone: string; beneficiary_doc: string; beneficiary_address: string;
  amount_usd: number; exchange_rate: number; commission_usd: number;
  origin: RemittanceOrigin;
  payout_method: RemittancePayoutMethod;
  notes: string;
  assigned_to?: string | null;
  courier_fee_cup?: number;
  created_by: string | null;
}): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.from("remittance_operations").insert(input).select("id").single();
  if (error) throw error;
  bust();
  return data.id;
}

export async function updateRemittance(id: string, patch: Database["public"]["Tables"]["remittance_operations"]["Update"]): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("remittance_operations").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export type RemittanceDelivery = {
  currency: DeliveryCurrency;
  /** Monto entregado al beneficiario, en `currency`. */
  amount: number;
  /** Tasa usada con el cliente (origen → moneda de entrega). Informativa. */
  rate?: number | null;
  /** Tasa de COSTO de la moneda entregada → CUP (lo que cuesta conseguirla). */
  cost_rate?: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Marca la remesa como entregada y congela su ganancia:
 *   comisión_cup = commission_usd × exchange_rate
 *   costo_cup    = lo que costó entregar (delivery_amount × cost_rate; en CUP directo si entrega CUP)
 *   spread_cup   = amount_cup − costo_cup   (diferencia de tasas)
 *   profit_cup   = comisión_cup + spread_cup
 * Sin datos de entrega (APK/flujo legado) se asume entrega en CUP por
 * amount_cup → spread 0 y profit = comisión (comportamiento anterior).
 */
export async function payRemittance(id: string, userId: string, delivery?: RemittanceDelivery): Promise<void> {
  const sb = getSupabase();
  const r = await getRemittance(id);
  if (!r) throw new Error("Remesa no encontrada.");
  if (r.status !== "pendiente") throw new Error(`No se puede marcar como entregada una remesa en estado ${r.status}.`);

  const commissionCup = round2(r.commission_usd * r.exchange_rate);
  let costCup = r.amount_cup; // entrega CUP a la misma tasa → spread 0
  let deliveryPatch: Database["public"]["Tables"]["remittance_operations"]["Update"] = {
    delivery_currency: "CUP",
    delivery_amount: r.amount_cup,
  };
  if (delivery) {
    if (!Number.isFinite(delivery.amount) || delivery.amount <= 0) throw new Error("Monto entregado inválido.");
    if (delivery.currency === "CUP") {
      costCup = delivery.amount;
    } else {
      if (!delivery.cost_rate || delivery.cost_rate <= 0) {
        throw new Error(`Falta la tasa de costo ${delivery.currency}→CUP para calcular la ganancia.`);
      }
      costCup = delivery.amount * delivery.cost_rate;
    }
    deliveryPatch = {
      delivery_currency: delivery.currency,
      delivery_amount: delivery.amount,
      delivery_rate: delivery.rate ?? null,
      delivery_cost_rate: delivery.cost_rate ?? null,
    };
  }
  const spreadCup = round2(r.amount_cup - costCup);
  const profitCup = round2(commissionCup + spreadCup);

  const { error } = await sb.from("remittance_operations").update({
    status: "entregada", paid_by: userId, paid_at: new Date().toISOString(),
    ...deliveryPatch,
    profit_cup: profitCup,
  }).eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador), en el negocio del origen.
  await generateRemittanceEntry({
    remittanceId: r.id,
    code: r.code,
    origin: r.origin,
    commissionCup,
    spreadCup,
    date: new Date().toISOString().slice(0, 10),
    userId,
  });

  // Si entregó un mensajero con tenedor de dinero vinculado, registrar que él
  // cobró/retuvo ese efectivo hasta rendir cuentas (best-effort).
  try {
    if (r.assigned_to) {
      const { data: holder } = await sb
        .from("money_holders")
        .select("id")
        .eq("business_slug", remittanceBusiness(r.origin))
        .eq("app_user_id", r.assigned_to)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if (holder) {
        const cur = (deliveryPatch.delivery_currency ?? "CUP") as DeliveryCurrency;
        await sb.from("money_movements").insert({
          business_slug: remittanceBusiness(r.origin),
          holder_id: holder.id,
          amount: -(deliveryPatch.delivery_amount ?? r.amount_cup), // el mensajero ENTREGÓ ese dinero
          currency: cur,
          kind: "entrega",
          remittance_id: r.id,
          notes: `Entrega remesa ${r.code}`,
          created_by: userId,
        });
      }
    }
  } catch (e) {
    console.error("[remittances] movimiento de mensajero falló:", e);
  }
  bust();
  revalidateTag("money_holders", "max");
}

export async function cancelRemittance(id: string): Promise<void> {
  const sb = getSupabase();
  const r = await getRemittance(id);
  if (!r) throw new Error("Remesa no encontrada.");
  if (r.status === "entregada") throw new Error("No se puede cancelar una remesa entregada.");
  const { error } = await sb.from("remittance_operations").update({ status: "cancelada" }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteRemittance(id: string): Promise<void> {
  const sb = getSupabase();
  const r = await getRemittance(id);
  if (!r) return;
  if (r.status === "entregada") throw new Error("No se puede eliminar una remesa entregada.");
  const { error } = await sb.from("remittance_operations").delete().eq("id", id);
  if (error) throw error;
  bust();
}

// ── Exchange rates ────────────────────────────────────────────────────────

export const listExchangeRates = unstable_cache(
  async (limit = 60): Promise<ExchangeRate[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("exchange_rates").select("*")
      .order("day", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) }));
  },
  ["exchange_rates_recent"], { revalidate: 60, tags: [TAG_RATES] },
);

export async function getLatestRate(from = "USD", to = "CUP"): Promise<ExchangeRate | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("exchange_rates").select("*")
    .eq("currency_from", from).eq("currency_to", to)
    .order("day", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, rate: Number(data.rate) };
}

export async function upsertExchangeRate(input: { day: string; currency_from: string; currency_to: string; rate: number; notes?: string }) {
  const sb = getSupabase();
  const { error } = await sb.from("exchange_rates").upsert(input, { onConflict: "day,currency_from,currency_to" });
  if (error) throw error;
  bustRates();
}

export async function deleteExchangeRate(day: string, currency_from: string, currency_to: string) {
  const sb = getSupabase();
  const { error } = await sb.from("exchange_rates").delete()
    .eq("day", day).eq("currency_from", currency_from).eq("currency_to", currency_to);
  if (error) throw error;
  bustRates();
}

export const REM_STATUS_LABEL: Record<RemittanceStatus, string> = {
  pendiente: "Pendiente",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const REM_STATUS_BADGE: Record<RemittanceStatus, string> = {
  pendiente: "bg-warning/10 text-warning-foreground",
  entregada: "bg-success/10 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};

export const REM_PAYOUT_LABEL: Record<RemittancePayoutMethod, string> = {
  efectivo: "Efectivo",
  tarjeta_cup: "Tarjeta CUP",
  transferencia: "Transferencia",
  otro: "Otro",
};

// ── Origen ─────────────────────────────────────────────────────────────────
// El monto enviado y la comisión están en la moneda del origen.

export const REM_ORIGIN_LABEL: Record<RemittanceOrigin, string> = {
  eeuu: "Estados Unidos",
  europa: "Europa",
};

export const REM_ORIGIN_CURRENCY: Record<RemittanceOrigin, string> = {
  eeuu: "USD",
  europa: "EUR",
};

export function remittanceCurrency(origin: RemittanceOrigin): string {
  return REM_ORIGIN_CURRENCY[origin];
}

// ── Negocio contable ────────────────────────────────────────────────────────
// Las remesas son DOS negocios separados (EE.UU. sin socios, Europa con un
// socio 50/50). El módulo operativo y la RLS siguen bajo el slug 'remesas';
// la contabilidad se separa derivando el negocio del origen (migración 0033).

export function remittanceBusiness(origin: RemittanceOrigin): "remesas_eeuu" | "remesas_europa" {
  return origin === "europa" ? "remesas_europa" : "remesas_eeuu";
}

export const REM_BUSINESS_LABEL: Record<"remesas_eeuu" | "remesas_europa", string> = {
  remesas_eeuu: "Remesas EE.UU.",
  remesas_europa: "Remesas Europa",
};
