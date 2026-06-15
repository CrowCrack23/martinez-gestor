import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { getLatestRate } from "./remittances";
import { deleteEntriesByReference } from "./accounting";
import { generateCommissionEntry, generateSaleEntry } from "./auto-accounting";
import { getPointOfSaleStaff } from "./points-of-sale";
import type { OrderCurrency, OrderOrigin, PaymentMethod } from "./supabase-types";

// Cuadres del punto de venta (negocio de ropa; reusable por mercaditos).
//
// El cuadre DIARIO se previsualiza al vuelo sobre las órdenes confirmadas del
// día y, al confirmarse, se congela como snapshot en daily_closures (única por
// warehouse+día): totales, comisión del trabajador (% sobre la ganancia,
// requisito del cliente) y desglose del dinero (efectivo CUP / transferencia /
// USD). El cuadre SEMANAL no se persiste: se calcula al vuelo, con comparación
// contra la semana anterior y sugerencias (producto más/menos vendido, día que
// más vende, producto con más ganancia).
//
// Días en UTC: el corte del día usa [day 00:00Z, day+1 00:00Z). Coherente
// mientras todas las consultas usen el mismo criterio.

const TAG = "closures";

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

type ClosureOrderRaw = {
  id: string;
  code: string;
  origin: OrderOrigin;
  payment_method: PaymentMethod;
  currency: OrderCurrency;
  amount_usd: number | null;
  sale_rate: number | null;
  total_amount: number;
  cogs_total: number;
  cogs_usd: number;
  confirmed_at: string;
  movement_id: string | null;
  customers: { name: string } | null;
  order_lines: {
    product_id: string;
    quantity: number;
    line_total: number;
    products: { name: string } | null;
  }[] | null;
};

async function fetchConfirmedOrders(
  warehouseId: string,
  fromDay: string,
  toDayExclusive: string,
): Promise<ClosureOrderRaw[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("orders")
    .select(
      "id,code,origin,payment_method,currency,amount_usd,sale_rate,total_amount,cogs_total,cogs_usd,confirmed_at,movement_id,customers(name),order_lines(product_id,quantity,line_total,products(name))",
    )
    .eq("warehouse_id", warehouseId)
    .eq("status", "confirmada")
    .gte("confirmed_at", `${fromDay}T00:00:00Z`)
    .lt("confirmed_at", `${toDayExclusive}T00:00:00Z`)
    .order("confirmed_at");
  if (error) throw error;
  return (data ?? []) as unknown as ClosureOrderRaw[];
}

export type ClosureProductRow = {
  product_id: string;
  product_name: string;
  qty: number;
  revenue_cup: number;
  profit_cup: number;
};

/** Agrega ventas por producto, prorrateando el COGS de cada orden por línea. */
function aggregateProducts(orders: ClosureOrderRaw[]): ClosureProductRow[] {
  const acc = new Map<string, ClosureProductRow>();
  for (const o of orders) {
    const total = Number(o.total_amount);
    const cogs = Number(o.cogs_total);
    for (const l of o.order_lines ?? []) {
      const lineTotal = Number(l.line_total);
      const lineCogs = total > 0 ? cogs * (lineTotal / total) : 0;
      const cur = acc.get(l.product_id) ?? {
        product_id: l.product_id,
        product_name: l.products?.name ?? l.product_id,
        qty: 0,
        revenue_cup: 0,
        profit_cup: 0,
      };
      cur.qty += l.quantity;
      cur.revenue_cup = round2(cur.revenue_cup + lineTotal);
      cur.profit_cup = round2(cur.profit_cup + (lineTotal - lineCogs));
      acc.set(l.product_id, cur);
    }
  }
  return Array.from(acc.values()).sort((a, b) => b.qty - a.qty);
}

export type DailyClosurePreview = {
  warehouse_id: string;
  warehouse_name: string;
  business_slug: string | null;
  day: string;
  order_count: number;
  revenue_cup: number;
  cogs_cup: number;
  cogs_usd: number;
  profit_cup: number;
  commission_pct: number;
  commission_cup: number;
  net_cup: number;
  cash_cup: number;
  transfer_cup: number;
  usd_total: number;
  rate_used: number | null;
  staff_user_id: string | null;
  products: ClosureProductRow[];
  already_closed: boolean;
};

/** Cuadre del día calculado al vuelo (no persiste nada). */
export async function previewDailyClosure(warehouseId: string, day: string): Promise<DailyClosurePreview> {
  const sb = getSupabase();
  const { data: wh, error: wErr } = await sb
    .from("warehouses")
    .select("id,name,store_slug")
    .eq("id", warehouseId)
    .maybeSingle();
  if (wErr) throw wErr;
  if (!wh) throw new Error("Punto de venta no encontrado.");

  const [orders, staff, rate, existing] = await Promise.all([
    fetchConfirmedOrders(warehouseId, day, addDays(day, 1)),
    getPointOfSaleStaff(warehouseId),
    getLatestRate("USD", "CUP"),
    sb.from("daily_closures").select("id").eq("warehouse_id", warehouseId).eq("day", day).maybeSingle(),
  ]);
  if (existing.error) throw existing.error;

  let revenue = 0;
  let cogs = 0;
  let cogsUsd = 0;
  let cash = 0;
  let transfer = 0;
  let usd = 0;
  for (const o of orders) {
    const total = Number(o.total_amount);
    revenue += total;
    cogs += Number(o.cogs_total);
    cogsUsd += Number(o.cogs_usd ?? 0);
    if (o.currency === "USD") {
      // Cobrada en dólares: a la caja entró amount_usd (snapshot al confirmar).
      usd += o.amount_usd != null ? Number(o.amount_usd) : 0;
    } else if (o.payment_method === "efectivo" || o.payment_method === "mixto") {
      cash += total;
    } else {
      // transferencia / tarjeta / otro → dinero que no está en la caja física.
      transfer += total;
    }
  }

  const profit = round2(revenue - cogs);
  const pct = staff?.commission_pct ?? 0;
  const commission = round2(profit > 0 ? profit * (pct / 100) : 0);
  const rateUsed = rate?.rate ?? null;

  return {
    warehouse_id: wh.id,
    warehouse_name: wh.name,
    business_slug: wh.store_slug,
    day,
    order_count: orders.length,
    revenue_cup: round2(revenue),
    cogs_cup: round2(cogs),
    // COGS USD congelado por venta (moneda funcional); fallback a conversión
    // con la última tasa para órdenes anteriores al modelo dual.
    cogs_usd: cogsUsd > 0 ? round2(cogsUsd) : rateUsed ? round2(cogs / rateUsed) : 0,
    profit_cup: profit,
    commission_pct: pct,
    commission_cup: commission,
    net_cup: round2(profit - commission),
    cash_cup: round2(cash),
    transfer_cup: round2(transfer),
    usd_total: round2(usd),
    rate_used: rateUsed,
    staff_user_id: staff?.user_id ?? null,
    products: aggregateProducts(orders),
    already_closed: !!existing.data,
  };
}

/**
 * Confirma el cuadre del día: congela el snapshot en daily_closures, genera el
 * asiento de la comisión (gasto) y respalda los asientos de venta que falten
 * (las ventas confirmadas desde la APK no los generan; ver migración 0026).
 */
export async function confirmDailyClosure(warehouseId: string, day: string, userId: string): Promise<string> {
  const preview = await previewDailyClosure(warehouseId, day);
  if (preview.already_closed) throw new Error("Ya existe un cuadre confirmado para ese día.");
  if (preview.order_count === 0) throw new Error("No hay ventas confirmadas ese día; no hay nada que cuadrar.");
  if (!preview.business_slug) throw new Error("El punto de venta no tiene negocio (store_slug) asignado.");

  const sb = getSupabase();
  const { data, error } = await sb
    .from("daily_closures")
    .insert({
      warehouse_id: warehouseId,
      business_slug: preview.business_slug,
      day,
      revenue_cup: preview.revenue_cup,
      cogs_cup: preview.cogs_cup,
      cogs_usd: preview.cogs_usd,
      profit_cup: preview.profit_cup,
      commission_pct: preview.commission_pct,
      commission_cup: preview.commission_cup,
      net_cup: preview.net_cup,
      cash_cup: preview.cash_cup,
      transfer_cup: preview.transfer_cup,
      usd_total: preview.usd_total,
      order_count: preview.order_count,
      rate_used: preview.rate_used,
      closed_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe un cuadre confirmado para ese día.");
    throw error;
  }

  // Respaldo contable de las ventas del día (idempotente por orden).
  const orders = await fetchConfirmedOrders(warehouseId, day, addDays(day, 1));
  for (const o of orders) {
    await generateSaleEntry({
      orderId: o.id,
      code: o.code,
      customerName: o.customers?.name ?? null,
      total: Number(o.total_amount),
      paymentMethod: o.payment_method,
      currency: o.currency,
      origin: o.origin,
      movementId: o.movement_id,
      business: preview.business_slug,
      date: day,
      userId,
      // Valores congelados al confirmar la venta (RPC confirm_pos_order).
      rate: o.sale_rate != null ? Number(o.sale_rate) : null,
      amountUsd: o.amount_usd != null ? Number(o.amount_usd) : null,
      cogsUsd: o.cogs_usd != null ? Number(o.cogs_usd) : null,
    });
  }

  // Asiento del pago del trabajador (descuenta del dinero del cuadre).
  await generateCommissionEntry({
    closureId: data.id,
    warehouseName: preview.warehouse_name,
    day,
    commissionCup: preview.commission_cup,
    business: preview.business_slug,
    userId,
  });

  bust();
  return data.id;
}

/**
 * Reabre un cuadre diario confirmado: anula el asiento de comisión que generó y
 * borra el snapshot, dejando el día como antes del cuadre. Los asientos de venta
 * (respaldo de las ventas, idempotentes) NO se tocan: pertenecen a las ventas,
 * no al cuadre, y se regeneran sin duplicar al reconfirmar. Descontabiliza la
 * comisión si estaba contabilizada.
 */
export async function reopenDailyClosure(warehouseId: string, day: string): Promise<void> {
  const sb = getSupabase();
  const { data: closure, error } = await sb
    .from("daily_closures")
    .select("id")
    .eq("warehouse_id", warehouseId)
    .eq("day", day)
    .maybeSingle();
  if (error) throw error;
  if (!closure) throw new Error("No hay un cuadre confirmado para ese día.");
  // Anula la comisión (reference_type='cuadre'); la descontabiliza si lo estaba.
  await deleteEntriesByReference("cuadre", closure.id);
  const { error: dErr } = await sb.from("daily_closures").delete().eq("id", closure.id);
  if (dErr) throw dErr;
  bust();
}

export type DailyClosureRow = {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  business_slug: string;
  day: string;
  revenue_cup: number;
  cogs_cup: number;
  cogs_usd: number;
  profit_cup: number;
  commission_pct: number;
  commission_cup: number;
  net_cup: number;
  cash_cup: number;
  transfer_cup: number;
  usd_total: number;
  order_count: number;
  rate_used: number | null;
  created_at: string;
};

/** Historial de cuadres confirmados (más recientes primero). */
export const listDailyClosures = unstable_cache(
  async (filter?: { warehouseId?: string; scope?: string[]; limit?: number }): Promise<DailyClosureRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("daily_closures")
      .select("*, warehouses!inner(name)")
      .order("day", { ascending: false })
      .limit(filter?.limit ?? 60);
    if (filter?.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
    if (filter?.scope) q = q.in("business_slug", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    type Raw = DailyClosureRow & { warehouses: { name: string } | null };
    return ((data ?? []) as unknown as Raw[]).map((r) => ({
      ...r,
      warehouse_name: r.warehouses?.name ?? "",
      revenue_cup: Number(r.revenue_cup),
      cogs_cup: Number(r.cogs_cup),
      cogs_usd: Number(r.cogs_usd),
      profit_cup: Number(r.profit_cup),
      commission_pct: Number(r.commission_pct),
      commission_cup: Number(r.commission_cup),
      net_cup: Number(r.net_cup),
      cash_cup: Number(r.cash_cup),
      transfer_cup: Number(r.transfer_cup),
      usd_total: Number(r.usd_total),
      rate_used: r.rate_used != null ? Number(r.rate_used) : null,
    }));
  },
  ["daily_closures_list"],
  { revalidate: 30, tags: [TAG] },
);

// ── Cuadre semanal ───────────────────────────────────────────────────────────

export type WeeklyTotals = {
  revenue_cup: number;
  cogs_cup: number;
  profit_cup: number;
  commission_cup: number;
  /** Costo de las mermas de la semana (pérdida de inventario). */
  merma_cup: number;
  net_cup: number;
  order_count: number;
};

export type WeeklyReport = {
  warehouse_id: string;
  warehouse_name: string;
  week_start: string; // lunes
  week_end: string;   // domingo
  totals: WeeklyTotals;
  prev_totals: WeeklyTotals;
  by_day: { day: string; revenue_cup: number; profit_cup: number; order_count: number }[];
  suggestions: {
    top_seller: ClosureProductRow | null;    // "este producto se vende mucho, trae más"
    bottom_seller: ClosureProductRow | null; // el que menos se vende
    top_profit: ClosureProductRow | null;    // el que más ganancia da
    best_day: { day: string; revenue_cup: number } | null; // el día que más vende
  };
  products: ClosureProductRow[];
};

function weekTotals(orders: ClosureOrderRaw[], pct: number, mermaCup: number): WeeklyTotals {
  let revenue = 0;
  let cogs = 0;
  for (const o of orders) {
    revenue += Number(o.total_amount);
    cogs += Number(o.cogs_total);
  }
  const profit = round2(revenue - cogs);
  const commission = round2(profit > 0 ? profit * (pct / 100) : 0);
  const merma = round2(mermaCup);
  return {
    revenue_cup: round2(revenue),
    cogs_cup: round2(cogs),
    profit_cup: profit,
    commission_cup: commission,
    merma_cup: merma,
    // El neto descuenta la comisión del vendedor Y la pérdida por merma.
    net_cup: round2(profit - commission - merma),
    order_count: orders.length,
  };
}

/**
 * Costo (CUP histórico) de las mermas registradas en un almacén dentro de un
 * rango de días. Suma el consumo FIFO (quantity × unit_cost) de los movimientos
 * de tipo 'merma' del almacén. Antes la merma no aparecía en ningún cuadre.
 */
async function fetchMermaCost(warehouseId: string, fromDay: string, toDayExclusive: string): Promise<number> {
  const sb = getSupabase();
  const { data: movs, error } = await sb
    .from("inventory_movements")
    .select("id")
    .eq("type", "merma")
    .eq("warehouse_from", warehouseId)
    .gte("created_at", `${fromDay}T00:00:00Z`)
    .lt("created_at", `${toDayExclusive}T00:00:00Z`);
  if (error) throw error;
  const ids = (movs ?? []).map((m) => m.id);
  if (ids.length === 0) return 0;
  const { data: cons, error: cErr } = await sb
    .from("inventory_lot_consumptions")
    .select("quantity, unit_cost")
    .in("movement_id", ids);
  if (cErr) throw cErr;
  let cost = 0;
  for (const c of cons ?? []) cost += Number(c.quantity) * Number(c.unit_cost);
  return round2(cost);
}

/** Lunes (YYYY-MM-DD) de la semana que contiene el día dado. */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(day, delta);
}

/**
 * Reporte semanal al vuelo: totales, comparación con la semana anterior y
 * sugerencias de mejora calculadas por agregación (sin IA).
 */
export async function weeklyReport(warehouseId: string, weekStart: string): Promise<WeeklyReport> {
  const sb = getSupabase();
  const { data: wh, error: wErr } = await sb
    .from("warehouses")
    .select("id,name")
    .eq("id", warehouseId)
    .maybeSingle();
  if (wErr) throw wErr;
  if (!wh) throw new Error("Punto de venta no encontrado.");

  const prevStart = addDays(weekStart, -7);
  const endExclusive = addDays(weekStart, 7);
  const [all, staff, mermaCurrent, mermaPrev] = await Promise.all([
    fetchConfirmedOrders(warehouseId, prevStart, endExclusive),
    getPointOfSaleStaff(warehouseId),
    fetchMermaCost(warehouseId, weekStart, endExclusive),
    fetchMermaCost(warehouseId, prevStart, weekStart),
  ]);
  const pct = staff?.commission_pct ?? 0;

  const current = all.filter((o) => o.confirmed_at >= `${weekStart}T00:00:00`);
  const previous = all.filter((o) => o.confirmed_at < `${weekStart}T00:00:00`);

  // Totales por día de la semana actual.
  const byDayMap = new Map<string, { revenue: number; profit: number; count: number }>();
  for (let i = 0; i < 7; i++) {
    byDayMap.set(addDays(weekStart, i), { revenue: 0, profit: 0, count: 0 });
  }
  for (const o of current) {
    const day = o.confirmed_at.slice(0, 10);
    const cur = byDayMap.get(day);
    if (!cur) continue;
    cur.revenue += Number(o.total_amount);
    cur.profit += Number(o.total_amount) - Number(o.cogs_total);
    cur.count += 1;
  }
  const byDay = Array.from(byDayMap.entries()).map(([day, v]) => ({
    day,
    revenue_cup: round2(v.revenue),
    profit_cup: round2(v.profit),
    order_count: v.count,
  }));

  const products = aggregateProducts(current);
  const sold = products.filter((p) => p.qty > 0);
  const bestDay = byDay.reduce<{ day: string; revenue_cup: number } | null>(
    (best, d) => (d.revenue_cup > 0 && (!best || d.revenue_cup > best.revenue_cup) ? { day: d.day, revenue_cup: d.revenue_cup } : best),
    null,
  );

  return {
    warehouse_id: wh.id,
    warehouse_name: wh.name,
    week_start: weekStart,
    week_end: addDays(weekStart, 6),
    totals: weekTotals(current, pct, mermaCurrent),
    prev_totals: weekTotals(previous, pct, mermaPrev),
    by_day: byDay,
    suggestions: {
      top_seller: sold.length > 0 ? sold[0] : null,
      bottom_seller: sold.length > 1 ? sold[sold.length - 1] : null,
      top_profit: sold.length > 0 ? [...sold].sort((a, b) => b.profit_cup - a.profit_cup)[0] : null,
      best_day: bestDay,
    },
    products,
  };
}
