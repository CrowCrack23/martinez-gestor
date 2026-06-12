import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createJournalEntry, forceDeleteJournalEntry } from "./accounting";
import { assertFreshRate } from "./currency";
import type { Database } from "./supabase-types";

// Socios por negocio (migración 0029) y aportes de capital (0030).
//
// Los socios NO son usuarios del sistema (solo el cliente entra a la
// contabilidad); por eso viven en business_partners y no en business_members.
// Regla del cliente: el % de cada socio es FIJO y la suma de los % de los
// socios activos + el % de crecimiento de la empresa debe ser exactamente 100.
// El % de crecimiento (business_settings.growth_pct) es modificable.

const TAG = "partners";

function bust() {
  revalidateTag(TAG, "max");
}

export type BusinessPartner = Database["public"]["Tables"]["business_partners"]["Row"];
export type CapitalContribution = Database["public"]["Tables"]["capital_contributions"]["Row"];

export const listPartners = unstable_cache(
  async (business?: string): Promise<BusinessPartner[]> => {
    const sb = getSupabase();
    let q = sb
      .from("business_partners")
      .select("*")
      .order("active", { ascending: false })
      .order("position")
      .order("name");
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as BusinessPartner[]).map((p) => ({ ...p, profit_pct: Number(p.profit_pct) }));
  },
  ["business_partners"],
  { revalidate: 60, tags: [TAG] },
);

export const getGrowthPct = unstable_cache(
  async (business: string): Promise<number> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("business_settings")
      .select("growth_pct")
      .eq("business_slug", business)
      .maybeSingle();
    if (error) throw error;
    return data ? Number(data.growth_pct) : 0;
  },
  ["business_growth_pct"],
  { revalidate: 60, tags: [TAG] },
);

/** Suma de % de socios activos + % de crecimiento (debe dar 100 para repartir). */
export async function percentagesStatus(business: string): Promise<{ partnersPct: number; growthPct: number; total: number; ok: boolean }> {
  const [partners, growthPct] = await Promise.all([listPartners(business), getGrowthPct(business)]);
  const partnersPct = partners.filter((p) => p.active).reduce((s, p) => s + p.profit_pct, 0);
  const total = Math.round((partnersPct + growthPct) * 100) / 100;
  return { partnersPct, growthPct, total, ok: Math.abs(total - 100) < 0.005 };
}

export async function createPartner(input: {
  business_slug: string;
  name: string;
  profit_pct: number;
  notes?: string;
}): Promise<void> {
  validatePct(input.profit_pct);
  const sb = getSupabase();
  const { error } = await sb.from("business_partners").insert({
    business_slug: input.business_slug,
    name: input.name,
    profit_pct: input.profit_pct,
    notes: input.notes ?? "",
  });
  if (error) throw error;
  bust();
}

export async function updatePartner(
  id: string,
  patch: Partial<{ name: string; profit_pct: number; active: boolean; notes: string }>,
): Promise<void> {
  if (patch.profit_pct != null) validatePct(patch.profit_pct);
  const sb = getSupabase();
  const { error } = await sb.from("business_partners").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

/**
 * Elimina un socio agregado por error. Solo si no tiene historial contable
 * (aportes de capital ni líneas de reparto): esos tienen FK `on delete restrict`
 * y borrarlo descuadraría la contabilidad. Si lo tiene, hay que desactivarlo.
 */
export async function deletePartner(id: string): Promise<void> {
  const sb = getSupabase();
  const [{ count: contribs, error: cErr }, { count: shares, error: sErr }] = await Promise.all([
    sb.from("capital_contributions").select("id", { count: "exact", head: true }).eq("partner_id", id),
    sb.from("profit_distribution_lines").select("id", { count: "exact", head: true }).eq("partner_id", id),
  ]);
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if ((contribs ?? 0) > 0) throw new Error("El socio tiene aportes de capital registrados. Desactívalo en su lugar.");
  if ((shares ?? 0) > 0) throw new Error("El socio ya entró en un reparto de ganancias. Desactívalo en su lugar.");
  const { error } = await sb.from("business_partners").delete().eq("id", id);
  if (error) throw error;
  bust();
}

export async function setGrowthPct(business: string, pct: number, userId: string | null): Promise<void> {
  validatePct(pct);
  const sb = getSupabase();
  const { error } = await sb.from("business_settings").upsert(
    { business_slug: business, growth_pct: pct, updated_by: userId },
    { onConflict: "business_slug" },
  );
  if (error) throw error;
  bust();
}

function validatePct(pct: number) {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error("El % debe estar entre 0 y 100.");
  }
}

// ── Aportes de capital ──────────────────────────────────────────────────

const ACC_CAJA_CUP = "1110";
const ACC_CAJA_USD = "1120";
const ACC_CAPITAL = "3100";

export type ContributionRow = CapitalContribution & { partner_name: string };

export const listContributions = unstable_cache(
  async (business?: string): Promise<ContributionRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("capital_contributions")
      .select("*, business_partners(name)")
      .order("contributed_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    type R = CapitalContribution & { business_partners: { name: string } | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      amount: Number(r.amount),
      partner_name: r.business_partners?.name ?? "—",
    }));
  },
  ["capital_contributions"],
  { revalidate: 60, tags: [TAG] },
);

/**
 * Registra un aporte de capital de un socio y genera (best-effort) el asiento:
 * Caja CUP (1110) o Caja USD (1120) DEBE / Capital social (3100) HABER.
 */
export async function addContribution(input: {
  business_slug: string;
  partner_id: string;
  amount: number;
  currency: "CUP" | "USD";
  contributed_at: string;
  notes?: string;
  created_by: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  const sb = getSupabase();
  const { data, error } = await sb
    .from("capital_contributions")
    .insert({
      business_slug: input.business_slug,
      partner_id: input.partner_id,
      amount: input.amount,
      currency: input.currency,
      contributed_at: input.contributed_at,
      notes: input.notes ?? "",
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Asiento best-effort (patrón lib/auto-accounting.ts): no bloquea el aporte.
  try {
    const cajaCode = input.currency === "USD" ? ACC_CAJA_USD : ACC_CAJA_CUP;
    const { data: accounts, error: aErr } = await sb
      .from("accounts")
      .select("id, code")
      .in("code", [cajaCode, ACC_CAPITAL]);
    if (aErr) throw aErr;
    const byCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
    const caja = byCode.get(cajaCode);
    const capital = byCode.get(ACC_CAPITAL);
    if (!caja || !capital) throw new Error("Faltan cuentas 1110/1120/3100 en el plan de cuentas.");
    const { data: partner } = await sb.from("business_partners").select("name").eq("id", input.partner_id).maybeSingle();
    const who = partner?.name ?? "socio";
    // Asiento dual (USD funcional): la tasa del día congela el otro lado.
    const rate = await assertFreshRate();
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const amountCup = input.currency === "USD" ? r2(input.amount * rate) : input.amount;
    const amountUsd = input.currency === "USD" ? input.amount : r2(input.amount / rate);
    const entryId = await createJournalEntry({
      entry_date: input.contributed_at,
      description: `Aporte de capital — ${who}`,
      reference_type: "aporte_capital",
      reference_id: data.id,
      business: input.business_slug,
      exchange_rate: rate,
      created_by: input.created_by,
      lines: [
        { account_id: caja, debit: amountCup, credit: 0, debit_usd: amountUsd, credit_usd: 0, description: `Aporte ${input.currency}` },
        { account_id: capital, debit: 0, credit: amountCup, debit_usd: 0, credit_usd: amountUsd, description: `Capital social — ${who}` },
      ],
    });
    await sb.from("capital_contributions").update({ journal_entry_id: entryId }).eq("id", data.id);
  } catch (e) {
    console.error("[partners] asiento de aporte falló:", e);
  }
  bust();
}

/**
 * Elimina un aporte de capital registrado por error y su asiento (lo
 * descontabiliza si estaba contabilizado).
 */
export async function deleteContribution(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: c, error } = await sb
    .from("capital_contributions")
    .select("id, journal_entry_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!c) return;
  if (c.journal_entry_id) await forceDeleteJournalEntry(c.journal_entry_id);
  const { error: dErr } = await sb.from("capital_contributions").delete().eq("id", id);
  if (dErr) throw dErr;
  bust();
}
