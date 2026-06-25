import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { getRateForDate } from "./currency";
import { deleteEntriesByReference } from "./accounting";
import { generateCentroWorkerPayEntry } from "./auto-accounting";
import { weekStartOf } from "./closures";

// Cuadres del CENTRO DE ELABORACIÓN (negocio 'centro'). A diferencia del cuadre
// de los puntos de venta (ventas a clientes), este se basa en las ENTREGAS DE
// PRODUCCIÓN al almacén central: ingreso = precio de transferencia (T), costo =
// insumos (C), ganancia = T − C, y el 33% de esa ganancia se paga a los obreros.
//
// Fuente de datos: los asientos de la maquila interna (reference_type
// 'produccion_centro', business 'centro') que genera produceOrder: la línea de
// Ventas de producción (4400) es T y la de Costo de ventas (5100) es C.

const TAG = "centro_closures";
const BUSINESS_CENTRO = "centro";
const ACC_REVENUE = "4400";
const ACC_COST = "5100";

/** % de la ganancia del centro que se paga a los obreros. */
export const CENTRO_WORKER_PCT = 33;

function bust() {
  revalidateTag(TAG, "max");
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CentroProductionRow = {
  production_id: string;
  code: string;
  product_name: string;
  qty: number;
  revenue_cup: number;
  cost_cup: number;
  profit_cup: number;
};

type HandoffAgg = {
  byProduction: Map<string, { revenue: number; cost: number; entry_date: string }>;
};

/** Lee los asientos de entrega del centro en [fromDay, toDayExclusive) y agrega T y C por producción. */
async function fetchHandoffs(fromDay: string, toDayExclusive: string): Promise<HandoffAgg> {
  const sb = getSupabase();
  const { data: entries, error } = await sb
    .from("journal_entries")
    .select("id, reference_id, entry_date")
    .eq("reference_type", "produccion_centro")
    .eq("business", BUSINESS_CENTRO)
    .gte("entry_date", fromDay)
    .lt("entry_date", toDayExclusive);
  if (error) throw error;
  const rows = (entries ?? []) as { id: string; reference_id: string | null; entry_date: string }[];
  const byProduction = new Map<string, { revenue: number; cost: number; entry_date: string }>();
  if (rows.length === 0) return { byProduction };

  const entryToProd = new Map(rows.map((r) => [r.id, r]));
  const { data: lines, error: lErr } = await sb
    .from("journal_lines")
    .select("entry_id, debit, credit, accounts!inner(code)")
    .in("entry_id", rows.map((r) => r.id));
  if (lErr) throw lErr;
  type LineRaw = { entry_id: string; debit: number; credit: number; accounts: { code: string } | null };
  for (const l of (lines ?? []) as unknown as LineRaw[]) {
    const e = entryToProd.get(l.entry_id);
    if (!e || !e.reference_id) continue;
    const cur = byProduction.get(e.reference_id) ?? { revenue: 0, cost: 0, entry_date: e.entry_date };
    if (l.accounts?.code === ACC_REVENUE) cur.revenue += Number(l.credit);
    if (l.accounts?.code === ACC_COST) cur.cost += Number(l.debit);
    byProduction.set(e.reference_id, cur);
  }
  return { byProduction };
}

/** Detalle por producción (code, producto, cantidad) para mostrar en el cuadre. */
async function productionRows(agg: HandoffAgg): Promise<CentroProductionRow[]> {
  const ids = Array.from(agg.byProduction.keys());
  if (ids.length === 0) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("production_orders")
    .select("id, code, quantity, bills_of_materials!inner(products!inner(name))")
    .in("id", ids);
  if (error) throw error;
  type R = { id: string; code: string; quantity: number; bills_of_materials: { products: { name: string } | null } | null };
  const meta = new Map((data ?? []).map((r) => {
    const rr = r as unknown as R;
    return [rr.id, { code: rr.code, qty: Number(rr.quantity), name: rr.bills_of_materials?.products?.name ?? "" }];
  }));
  const out: CentroProductionRow[] = [];
  for (const [pid, v] of agg.byProduction) {
    const m = meta.get(pid);
    const revenue = round2(v.revenue);
    const cost = round2(v.cost);
    out.push({
      production_id: pid,
      code: m?.code ?? pid,
      product_name: m?.name ?? "",
      qty: m?.qty ?? 0,
      revenue_cup: revenue,
      cost_cup: cost,
      profit_cup: round2(revenue - cost),
    });
  }
  return out.sort((a, b) => b.profit_cup - a.profit_cup);
}

export type CentroDailyPreview = {
  day: string;
  order_count: number;
  revenue_cup: number;
  cost_cup: number;
  profit_cup: number;
  worker_pct: number;
  worker_pay_cup: number;
  net_cup: number;
  rate_used: number | null;
  productions: CentroProductionRow[];
  already_closed: boolean;
};

/** Cuadre del centro de un día, calculado al vuelo. */
export async function previewCentroDaily(day: string): Promise<CentroDailyPreview> {
  const sb = getSupabase();
  const [agg, rate, existing] = await Promise.all([
    fetchHandoffs(day, addDays(day, 1)),
    getRateForDate(day),
    sb.from("centro_closures").select("id").eq("business_slug", BUSINESS_CENTRO).eq("day", day).maybeSingle(),
  ]);
  if (existing.error) throw existing.error;
  const productions = await productionRows(agg);

  let revenue = 0;
  let cost = 0;
  for (const p of productions) {
    revenue += p.revenue_cup;
    cost += p.cost_cup;
  }
  const profit = round2(revenue - cost);
  const workerPay = round2(profit > 0 ? profit * (CENTRO_WORKER_PCT / 100) : 0);
  return {
    day,
    order_count: productions.length,
    revenue_cup: round2(revenue),
    cost_cup: round2(cost),
    profit_cup: profit,
    worker_pct: CENTRO_WORKER_PCT,
    worker_pay_cup: workerPay,
    net_cup: round2(profit - workerPay),
    rate_used: rate,
    productions,
    already_closed: !!existing.data,
  };
}

/** Confirma el cuadre del día: congela snapshot y genera el pago a obreros. */
export async function confirmCentroDaily(day: string, userId: string): Promise<string> {
  const preview = await previewCentroDaily(day);
  if (preview.already_closed) throw new Error("Ya existe un cuadre confirmado del centro para ese día.");
  if (preview.order_count === 0) throw new Error("No hay entregas de producción del centro ese día; no hay nada que cuadrar.");

  const sb = getSupabase();
  const { data, error } = await sb
    .from("centro_closures")
    .insert({
      business_slug: BUSINESS_CENTRO,
      day,
      revenue_cup: preview.revenue_cup,
      cost_cup: preview.cost_cup,
      profit_cup: preview.profit_cup,
      worker_pct: preview.worker_pct,
      worker_pay_cup: preview.worker_pay_cup,
      net_cup: preview.net_cup,
      order_count: preview.order_count,
      rate_used: preview.rate_used,
      closed_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un cuadre confirmado del centro para ese día.");
    throw error;
  }

  await generateCentroWorkerPayEntry({
    closureId: data.id,
    day,
    workerPayCup: preview.worker_pay_cup,
    userId,
  });

  bust();
  return data.id;
}

/** Reabre un cuadre del centro: anula el pago a obreros y borra el snapshot. */
export async function reopenCentroDaily(day: string): Promise<void> {
  const sb = getSupabase();
  const { data: closure, error } = await sb
    .from("centro_closures")
    .select("id")
    .eq("business_slug", BUSINESS_CENTRO)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  if (!closure) throw new Error("No hay un cuadre del centro confirmado para ese día.");
  await deleteEntriesByReference("cuadre_centro", closure.id);
  const { error: dErr } = await sb.from("centro_closures").delete().eq("id", closure.id);
  if (dErr) throw dErr;
  bust();
}

export type CentroClosureRow = {
  id: string;
  day: string;
  revenue_cup: number;
  cost_cup: number;
  profit_cup: number;
  worker_pct: number;
  worker_pay_cup: number;
  net_cup: number;
  order_count: number;
  created_at: string;
};

/** Historial de cuadres del centro confirmados (más recientes primero). */
export const listCentroClosures = unstable_cache(
  async (limit = 60): Promise<CentroClosureRow[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("centro_closures")
      .select("*")
      .eq("business_slug", BUSINESS_CENTRO)
      .order("day", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as CentroClosureRow[]).map((r) => ({
      ...r,
      revenue_cup: Number(r.revenue_cup),
      cost_cup: Number(r.cost_cup),
      profit_cup: Number(r.profit_cup),
      worker_pct: Number(r.worker_pct),
      worker_pay_cup: Number(r.worker_pay_cup),
      net_cup: Number(r.net_cup),
    }));
  },
  ["centro_closures_list"],
  { revalidate: 30, tags: [TAG] },
);

// ── Cuadre semanal del centro (al vuelo) ─────────────────────────────────────

export type CentroWeeklyTotals = {
  revenue_cup: number;
  cost_cup: number;
  profit_cup: number;
  worker_pay_cup: number;
  net_cup: number;
  order_count: number;
};

export type CentroWeeklyReport = {
  week_start: string;
  week_end: string;
  totals: CentroWeeklyTotals;
  prev_totals: CentroWeeklyTotals;
  by_day: { day: string; profit_cup: number; order_count: number }[];
  productions: CentroProductionRow[];
};

function totalsFrom(rows: CentroProductionRow[]): CentroWeeklyTotals {
  let revenue = 0;
  let cost = 0;
  for (const p of rows) {
    revenue += p.revenue_cup;
    cost += p.cost_cup;
  }
  const profit = round2(revenue - cost);
  const workerPay = round2(profit > 0 ? profit * (CENTRO_WORKER_PCT / 100) : 0);
  return {
    revenue_cup: round2(revenue),
    cost_cup: round2(cost),
    profit_cup: profit,
    worker_pay_cup: workerPay,
    net_cup: round2(profit - workerPay),
    order_count: rows.length,
  };
}

export { weekStartOf };

/** Reporte semanal del centro al vuelo, con comparación con la semana anterior. */
export async function centroWeeklyReport(weekStart: string): Promise<CentroWeeklyReport> {
  const endExclusive = addDays(weekStart, 7);
  const prevStart = addDays(weekStart, -7);
  const [aggCurrent, aggPrev] = await Promise.all([
    fetchHandoffs(weekStart, endExclusive),
    fetchHandoffs(prevStart, weekStart),
  ]);
  const [current, previous] = await Promise.all([productionRows(aggCurrent), productionRows(aggPrev)]);

  // Ganancia por día (de la semana actual).
  const byDayMap = new Map<string, { profit: number; count: number }>();
  for (let i = 0; i < 7; i++) byDayMap.set(addDays(weekStart, i), { profit: 0, count: 0 });
  for (const [pid, v] of aggCurrent.byProduction) {
    const cur = byDayMap.get(v.entry_date);
    if (!cur) continue;
    cur.profit += round2(v.revenue - v.cost);
    cur.count += 1;
    void pid;
  }
  const by_day = Array.from(byDayMap.entries()).map(([day, v]) => ({
    day,
    profit_cup: round2(v.profit),
    order_count: v.count,
  }));

  return {
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    totals: totalsFrom(current),
    prev_totals: totalsFrom(previous),
    by_day,
    productions: current,
  };
}
