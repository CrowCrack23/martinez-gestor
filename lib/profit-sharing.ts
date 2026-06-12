import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createJournalEntry, deleteEntriesByReference, incomeStatement } from "./accounting";
import { getGrowthPct, listPartners, percentagesStatus } from "./partners";
import type { Database } from "./supabase-types";

// Reparto mensual de ganancias a socios (migración 0032).
//
// Flujo (igual que los cuadres de lib/closures.ts): se PREVISUALIZA al vuelo
// sobre la utilidad del mes (incomeStatement del negocio; por decisión del
// cliente INCLUYE asientos en borrador, ya que los automáticos lo son) y al
// confirmarse se congela el snapshot. Después el cliente registra el pago a
// cada socio cuando lo efectúa (paid_at), lo que genera el asiento
// Retiros de socios (3300) DEBE / Caja CUP (1110) HABER.

const TAG = "profit_sharing";

function bust() {
  revalidateTag(TAG, "max");
}

export type ProfitDistribution = Database["public"]["Tables"]["profit_distributions"]["Row"];
export type ProfitDistributionLine = Database["public"]["Tables"]["profit_distribution_lines"]["Row"];

const ACC_CAJA_CUP = "1110";
const ACC_RETIROS = "3300";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rango [día 1, último día] del mes "YYYY-MM". */
function monthRange(month: string): { from: string; to: string; periodMonth: string } {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error("Mes inválido.");
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to, periodMonth: from };
}

export type DistributionPreview = {
  business: string;
  month: string;
  from: string;
  to: string;
  include_drafts: boolean;
  base_profit: number;
  growth_pct: number;
  growth_amount: number;
  distributable: number;
  lines: { partner_id: string; partner_name: string; profit_pct: number; amount: number }[];
  percentages_ok: boolean;
  already_confirmed: boolean;
};

/** Calcula el reparto del mes al vuelo (no persiste nada). */
export async function previewDistribution(
  business: string,
  month: string,
  includeDrafts = true,
): Promise<DistributionPreview> {
  const { from, to, periodMonth } = monthRange(month);
  const sb = getSupabase();
  const [pl, partners, growthPct, status, existing] = await Promise.all([
    incomeStatement({ from, to, business, postedOnly: !includeDrafts }),
    listPartners(business),
    getGrowthPct(business),
    percentagesStatus(business),
    sb
      .from("profit_distributions")
      .select("id")
      .eq("business_slug", business)
      .eq("period_month", periodMonth)
      .maybeSingle(),
  ]);
  if (existing.error) throw existing.error;

  const baseProfit = round2(pl.netIncome);
  const growthAmount = round2(Math.max(baseProfit, 0) * (growthPct / 100));
  const distributable = round2(Math.max(baseProfit, 0) - growthAmount);
  const lines = partners
    .filter((p) => p.active)
    .map((p) => ({
      partner_id: p.id,
      partner_name: p.name,
      profit_pct: p.profit_pct,
      // El % del socio se aplica sobre la ganancia base (la parte de la
      // empresa es otro % de la misma base; juntos suman 100).
      amount: round2(Math.max(baseProfit, 0) * (p.profit_pct / 100)),
    }));

  return {
    business,
    month,
    from,
    to,
    include_drafts: includeDrafts,
    base_profit: baseProfit,
    growth_pct: growthPct,
    growth_amount: growthAmount,
    distributable,
    lines,
    percentages_ok: status.ok,
    already_confirmed: !!existing.data,
  };
}

/** Congela el reparto del mes. Idempotente por (negocio, mes). */
export async function confirmDistribution(
  business: string,
  month: string,
  includeDrafts: boolean,
  userId: string | null,
): Promise<string> {
  const preview = await previewDistribution(business, month, includeDrafts);
  if (preview.already_confirmed) throw new Error("El reparto de ese mes ya está confirmado.");
  if (!preview.percentages_ok) {
    throw new Error("Los % de socios + crecimiento no suman 100. Ajústalos en /socios antes de repartir.");
  }
  if (preview.base_profit <= 0) {
    throw new Error("El mes no tiene ganancia que repartir.");
  }
  if (preview.lines.length === 0) throw new Error("El negocio no tiene socios activos.");

  const sb = getSupabase();
  const { from } = monthRange(month);
  const { data, error } = await sb
    .from("profit_distributions")
    .insert({
      business_slug: business,
      period_month: from,
      base_profit: preview.base_profit,
      growth_pct: preview.growth_pct,
      growth_amount: preview.growth_amount,
      distributable: preview.distributable,
      include_drafts: includeDrafts,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("El reparto de ese mes ya está confirmado.");
    }
    throw error;
  }

  const payload = preview.lines.map((l) => ({
    distribution_id: data.id,
    partner_id: l.partner_id,
    profit_pct: l.profit_pct,
    amount: l.amount,
  }));
  const { error: lErr } = await sb.from("profit_distribution_lines").insert(payload);
  if (lErr) {
    await sb.from("profit_distributions").delete().eq("id", data.id);
    throw lErr;
  }
  bust();
  return data.id;
}

/**
 * Reabre un reparto mensual confirmado: anula los asientos de pago a socios ya
 * registrados y borra el reparto (las líneas caen en cascada). Descontabiliza
 * los asientos que estuvieran contabilizados.
 */
export async function reopenDistribution(business: string, month: string): Promise<void> {
  const { periodMonth } = monthRange(month);
  const sb = getSupabase();
  const { data: dist, error } = await sb
    .from("profit_distributions")
    .select("id, profit_distribution_lines(id)")
    .eq("business_slug", business)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw error;
  if (!dist) throw new Error("No hay un reparto confirmado para ese mes.");
  type Row = { id: string; profit_distribution_lines: { id: string }[] | null };
  const d = dist as unknown as Row;
  for (const l of d.profit_distribution_lines ?? []) {
    await deleteEntriesByReference("reparto", l.id);
  }
  const { error: dErr } = await sb.from("profit_distributions").delete().eq("id", d.id);
  if (dErr) throw dErr;
  bust();
}

export type DistributionRow = ProfitDistribution & {
  lines: (ProfitDistributionLine & { partner_name: string })[];
};

export const listDistributions = unstable_cache(
  async (business?: string): Promise<DistributionRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("profit_distributions")
      .select("*, profit_distribution_lines(*, business_partners(name))")
      .order("period_month", { ascending: false });
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    type LR = ProfitDistributionLine & { business_partners: { name: string } | null };
    type R = ProfitDistribution & { profit_distribution_lines: LR[] | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      base_profit: Number(r.base_profit),
      growth_pct: Number(r.growth_pct),
      growth_amount: Number(r.growth_amount),
      distributable: Number(r.distributable),
      lines: (r.profit_distribution_lines ?? []).map((l) => ({
        ...l,
        profit_pct: Number(l.profit_pct),
        amount: Number(l.amount),
        partner_name: l.business_partners?.name ?? "—",
      })),
    }));
  },
  ["profit_distributions"],
  { revalidate: 60, tags: [TAG] },
);

/**
 * Registra el pago efectuado a un socio: setea paid_at, genera (best-effort)
 * el asiento Retiros de socios / Caja CUP y recalcula el estado del reparto.
 */
export async function markPartnerPaid(lineId: string, paidDate: string, userId: string | null): Promise<void> {
  const sb = getSupabase();
  const { data: line, error } = await sb
    .from("profit_distribution_lines")
    .select("*, profit_distributions(id, business_slug, period_month), business_partners(name)")
    .eq("id", lineId)
    .maybeSingle();
  if (error) throw error;
  type LR = ProfitDistributionLine & {
    profit_distributions: { id: string; business_slug: string; period_month: string } | null;
    business_partners: { name: string } | null;
  };
  const l = line as unknown as LR | null;
  if (!l || !l.profit_distributions) throw new Error("Línea de reparto no encontrada.");
  if (l.paid_at) throw new Error("Ese pago ya está registrado.");

  const { error: uErr } = await sb
    .from("profit_distribution_lines")
    .update({ paid_at: paidDate })
    .eq("id", lineId);
  if (uErr) throw uErr;

  // Asiento best-effort (no revierte el registro del pago).
  try {
    const amount = round2(Number(l.amount));
    if (amount > 0) {
      const { data: accounts, error: aErr } = await sb
        .from("accounts")
        .select("id, code")
        .in("code", [ACC_RETIROS, ACC_CAJA_CUP]);
      if (aErr) throw aErr;
      const byCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
      const retiros = byCode.get(ACC_RETIROS);
      const caja = byCode.get(ACC_CAJA_CUP);
      if (!retiros || !caja) throw new Error("Faltan cuentas 3300/1110 (aplicar migración 0031).");
      const who = l.business_partners?.name ?? "socio";
      const entryId = await createJournalEntry({
        entry_date: paidDate,
        description: `Reparto ${l.profit_distributions.period_month.slice(0, 7)} — ${who}`,
        reference_type: "reparto",
        reference_id: l.id,
        business: l.profit_distributions.business_slug,
        created_by: userId,
        lines: [
          { account_id: retiros, debit: amount, credit: 0, description: `Retiro de ${who}` },
          { account_id: caja, debit: 0, credit: amount, description: "Pago al socio" },
        ],
      });
      await sb.from("profit_distribution_lines").update({ journal_entry_id: entryId }).eq("id", lineId);
    }
  } catch (e) {
    console.error("[profit-sharing] asiento de reparto falló:", e);
  }

  // Recalcular estado del cabecero.
  const { data: siblings, error: sErr } = await sb
    .from("profit_distribution_lines")
    .select("paid_at")
    .eq("distribution_id", l.distribution_id);
  if (!sErr && siblings) {
    const paid = siblings.filter((s) => s.paid_at).length;
    const status = paid === 0 ? "calculada" : paid === siblings.length ? "pagada" : "pagada_parcial";
    await sb.from("profit_distributions").update({ status }).eq("id", l.distribution_id);
  }
  bust();
}
