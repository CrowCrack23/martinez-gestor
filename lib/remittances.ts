import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { generateRemittanceEntry } from "./auto-accounting";
import type { Database, RemittanceStatus, RemittancePayoutMethod } from "./supabase-types";

const TAG = "remittances";
const TAG_RATES = "exchange_rates";
function bust() { revalidateTag(TAG, "max"); }
function bustRates() { revalidateTag(TAG_RATES, "max"); }

export type Remittance = Database["public"]["Tables"]["remittance_operations"]["Row"];
export type ExchangeRate = Database["public"]["Tables"]["exchange_rates"]["Row"];

export const listRemittances = unstable_cache(
  async (filter?: { status?: RemittanceStatus }): Promise<Remittance[]> => {
    const sb = getSupabase();
    let q = sb.from("remittance_operations").select("*").order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
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
  payout_method: RemittancePayoutMethod;
  notes: string;
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

export async function payRemittance(id: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const r = await getRemittance(id);
  if (!r) throw new Error("Remesa no encontrada.");
  if (r.status !== "pendiente") throw new Error(`No se puede marcar como entregada una remesa en estado ${r.status}.`);
  const { error } = await sb.from("remittance_operations").update({
    status: "entregada", paid_by: userId, paid_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador): Caja CUP / Comisiones remesas (en CUP).
  await generateRemittanceEntry({
    remittanceId: r.id,
    code: r.code,
    commissionUsd: r.commission_usd,
    exchangeRate: r.exchange_rate,
    date: new Date().toISOString().slice(0, 10),
    userId,
  });
  bust();
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
