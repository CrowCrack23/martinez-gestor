import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createJournalEntry } from "./accounting";
import { generateCourierPayEntry } from "./auto-accounting";
import { listPartners } from "./partners";
import type { Database, RemittanceOrigin } from "./supabase-types";

// Cuadre SEMANAL de remesas por negocio (migración 0035).
//
// Patrón preview/confirm (como lib/closures.ts): se calcula al vuelo sobre
// las remesas ENTREGADAS de la semana (paid_at ∈ [lunes, +7)) del negocio
// (derivado del origin) y al confirmarse se congela el snapshot. Para
// Remesas Europa se generan líneas de reparto por socio (50/50 desde
// business_partners de 'remesas_europa'); el pago a cada socio se registra
// después con asiento Retiros de socios (3300) / Caja CUP (1110).

const TAG = "remittance_closures";

function bust() {
  revalidateTag(TAG, "max");
}

export type RemittanceWeeklyClosure = Database["public"]["Tables"]["remittance_weekly_closures"]["Row"];
export type RemittanceClosurePartnerLine = Database["public"]["Tables"]["remittance_closure_partner_lines"]["Row"];

const ACC_CAJA_CUP = "1110";
const ACC_RETIROS = "3300";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function originOf(business: string): RemittanceOrigin {
  return business === "remesas_europa" ? "europa" : "eeuu";
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type RemittanceWeeklyPreview = {
  business: string;
  week_start: string;
  week_end: string; // exclusivo
  delivered_count: number;
  commissions_cup: number;
  spread_cup: number;
  profit_cup: number;
  courier_pay_cup: number;
  net_cup: number;
  partner_lines: { partner_id: string; partner_name: string; profit_pct: number; amount: number }[];
  already_closed: boolean;
};

/** Calcula el cuadre semanal al vuelo (no persiste nada). */
export async function previewWeeklyClosure(business: string, weekStart: string): Promise<RemittanceWeeklyPreview> {
  const sb = getSupabase();
  const weekEnd = addDays(weekStart, 7);
  const [{ data: rows, error }, partners, existing] = await Promise.all([
    sb
      .from("remittance_operations")
      .select("commission_usd, exchange_rate, profit_cup, courier_fee_cup")
      .eq("status", "entregada")
      .eq("origin", originOf(business))
      .gte("paid_at", `${weekStart}T00:00:00Z`)
      .lt("paid_at", `${weekEnd}T00:00:00Z`),
    listPartners(business),
    sb
      .from("remittance_weekly_closures")
      .select("id")
      .eq("business_slug", business)
      .eq("week_start", weekStart)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (existing.error) throw existing.error;

  let commissions = 0;
  let profit = 0;
  let courierPay = 0;
  for (const r of rows ?? []) {
    const commissionCup = Number(r.commission_usd) * Number(r.exchange_rate);
    commissions += commissionCup;
    // profit_cup viene congelado de la entrega; remesas legadas sin él cuentan solo comisión.
    profit += r.profit_cup != null ? Number(r.profit_cup) : commissionCup;
    courierPay += Number(r.courier_fee_cup ?? 0);
  }
  commissions = round2(commissions);
  profit = round2(profit);
  courierPay = round2(courierPay);
  const spread = round2(profit - commissions);
  const net = round2(profit - courierPay);

  // Reparto entre socios (Europa 50/50). El % se aplica sobre el NETO de la
  // semana (ganancia − pago de mensajeros): es lo que de verdad se reparte.
  const partnerLines = partners
    .filter((p) => p.active)
    .map((p) => ({
      partner_id: p.id,
      partner_name: p.name,
      profit_pct: p.profit_pct,
      amount: round2(Math.max(net, 0) * (p.profit_pct / 100)),
    }));

  return {
    business,
    week_start: weekStart,
    week_end: weekEnd,
    delivered_count: (rows ?? []).length,
    commissions_cup: commissions,
    spread_cup: spread,
    profit_cup: profit,
    courier_pay_cup: courierPay,
    net_cup: net,
    partner_lines: partnerLines,
    already_closed: !!existing.data,
  };
}

/** Congela el cuadre de la semana. Idempotente por (negocio, semana). */
export async function confirmWeeklyClosure(business: string, weekStart: string, userId: string | null): Promise<string> {
  const preview = await previewWeeklyClosure(business, weekStart);
  if (preview.already_closed) throw new Error("El cuadre de esa semana ya está confirmado.");
  if (preview.delivered_count === 0) throw new Error("La semana no tiene remesas entregadas.");

  const sb = getSupabase();
  const { data, error } = await sb
    .from("remittance_weekly_closures")
    .insert({
      business_slug: business,
      week_start: weekStart,
      delivered_count: preview.delivered_count,
      commissions_cup: preview.commissions_cup,
      spread_cup: preview.spread_cup,
      profit_cup: preview.profit_cup,
      courier_pay_cup: preview.courier_pay_cup,
      net_cup: preview.net_cup,
      closed_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("El cuadre de esa semana ya está confirmado.");
    }
    throw error;
  }

  if (preview.partner_lines.length > 0) {
    const payload = preview.partner_lines.map((l) => ({
      closure_id: data.id,
      partner_id: l.partner_id,
      profit_pct: l.profit_pct,
      amount: l.amount,
    }));
    const { error: lErr } = await sb.from("remittance_closure_partner_lines").insert(payload);
    if (lErr) {
      await sb.from("remittance_weekly_closures").delete().eq("id", data.id);
      throw lErr;
    }
  }

  // Asiento del pago semanal a mensajeros (best-effort, idempotente).
  await generateCourierPayEntry({
    closureId: data.id,
    business,
    weekStart,
    amountCup: preview.courier_pay_cup,
    userId,
  });
  bust();
  return data.id;
}

export type RemittanceClosureRow = RemittanceWeeklyClosure & {
  lines: (RemittanceClosurePartnerLine & { partner_name: string })[];
};

export const listWeeklyClosures = unstable_cache(
  async (business?: string): Promise<RemittanceClosureRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("remittance_weekly_closures")
      .select("*, remittance_closure_partner_lines(*, business_partners(name))")
      .order("week_start", { ascending: false });
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    type LR = RemittanceClosurePartnerLine & { business_partners: { name: string } | null };
    type R = RemittanceWeeklyClosure & { remittance_closure_partner_lines: LR[] | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      commissions_cup: Number(r.commissions_cup),
      spread_cup: Number(r.spread_cup),
      profit_cup: Number(r.profit_cup),
      courier_pay_cup: Number(r.courier_pay_cup),
      net_cup: Number(r.net_cup),
      lines: (r.remittance_closure_partner_lines ?? []).map((l) => ({
        ...l,
        profit_pct: Number(l.profit_pct),
        amount: Number(l.amount),
        partner_name: l.business_partners?.name ?? "—",
      })),
    }));
  },
  ["remittance_weekly_closures"],
  { revalidate: 60, tags: [TAG] },
);

/**
 * Registra el pago efectuado a un socio del cuadre: setea paid_at, genera
 * (best-effort) el asiento Retiros de socios / Caja CUP y recalcula el estado.
 */
export async function markRemittancePartnerPaid(lineId: string, paidDate: string, userId: string | null): Promise<void> {
  const sb = getSupabase();
  const { data: line, error } = await sb
    .from("remittance_closure_partner_lines")
    .select("*, remittance_weekly_closures(id, business_slug, week_start), business_partners(name)")
    .eq("id", lineId)
    .maybeSingle();
  if (error) throw error;
  type LR = RemittanceClosurePartnerLine & {
    remittance_weekly_closures: { id: string; business_slug: string; week_start: string } | null;
    business_partners: { name: string } | null;
  };
  const l = line as unknown as LR | null;
  if (!l || !l.remittance_weekly_closures) throw new Error("Línea de reparto no encontrada.");
  if (l.paid_at) throw new Error("Ese pago ya está registrado.");

  const { error: uErr } = await sb
    .from("remittance_closure_partner_lines")
    .update({ paid_at: paidDate })
    .eq("id", lineId);
  if (uErr) throw uErr;

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
        description: `Reparto remesas semana ${l.remittance_weekly_closures.week_start} — ${who}`,
        reference_type: "reparto_remesas",
        reference_id: l.id,
        business: l.remittance_weekly_closures.business_slug,
        created_by: userId,
        lines: [
          { account_id: retiros, debit: amount, credit: 0, description: `Retiro de ${who}` },
          { account_id: caja, debit: 0, credit: amount, description: "Pago al socio" },
        ],
      });
      await sb.from("remittance_closure_partner_lines").update({ journal_entry_id: entryId }).eq("id", lineId);
    }
  } catch (e) {
    console.error("[remittance-closures] asiento de reparto falló:", e);
  }

  const { data: siblings, error: sErr } = await sb
    .from("remittance_closure_partner_lines")
    .select("paid_at")
    .eq("closure_id", l.closure_id);
  if (!sErr && siblings && siblings.length > 0) {
    const paid = siblings.filter((s) => s.paid_at).length;
    const status = paid === 0 ? "confirmada" : paid === siblings.length ? "pagada" : "pagada_parcial";
    await sb.from("remittance_weekly_closures").update({ status }).eq("id", l.closure_id);
  }
  bust();
}
