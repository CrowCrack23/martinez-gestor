import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createJournalEntry, forceDeleteJournalEntry, trialBalance } from "./accounting";
import { stockValuation } from "./costing";
import { listWarehouses } from "./warehouses";
import { getRate, assertFreshRate } from "./currency";
import { listContributions } from "./partners";
import type { Database, WarehouseType } from "./supabase-types";

// Trazabilidad del capital por negocio (requisito MIPYME): en todo momento
// saber dónde está el dinero. Se compone de:
//  - Dinero en movimiento: efectivo (saldos contables de caja/banco),
//    inventario valuado FIFO separado por etapa (insumos en el centro de
//    elaboración, producto terminado en el almacén central, mercancía en los
//    puntos de venta) y cuentas por cobrar, menos cuentas por pagar.
//  - Infraestructura: inversión fija registrada en fixed_assets (no se mueve).

const TAG = "capital";

function bust() {
  revalidateTag(TAG, "max");
}

export type FixedAsset = Database["public"]["Tables"]["fixed_assets"]["Row"];

const ACC_CAJA_CUP = "1110";
const ACC_CAJA_USD = "1120";
const ACC_BANCO = "1130";
const ACC_CXC = "1200";
const ACC_CXP = "2100";
const ACC_INFRA = "1500";
const ACC_OTROS_INGRESOS = "4900";
const ACC_OTROS_GASTOS = "5400";

export type CapitalSnapshot = {
  /** Última tasa USD→CUP registrada (null si no hay; los equivalentes quedan null). */
  usdRate: number | null;
  // Las cifras *Usd salen del libro dual: USD CONGELADO por transacción
  // (moneda funcional), no conversión a tasa de hoy.
  cash: {
    cup: number;
    /** Saldo real en dólares de la Caja USD (balance_usd congelado del libro). */
    usd: number;
    /** Equivalente CUP del saldo USD a la última tasa (referencia, null sin tasa). */
    usdCup: number | null;
    bank: number;
    total: number;
    /** Efectivo total en USD congelado (1110 + 1120 + 1130). */
    totalUsd: number;
  };
  /** Capital aportado por los socios (desglose por moneda de los aportes). */
  contributed: { cup: number; usd: number; total: number };
  inventory: {
    centro: number; // insumos / en elaboración (centro_elaboracion)
    almacen: number; // producto terminado (almacen_central)
    puntos: number; // mercancía en puntos de venta / tiendas
    total: number;
    /** Valor del inventario en USD congelado (costos USD de los lotes FIFO). */
    totalUsd: number;
    byWarehouse: { warehouse_id: string; name: string; type: WarehouseType; value: number; valueUsd: number }[];
  };
  receivables: number;
  receivablesUsd: number;
  payables: number;
  payablesUsd: number;
  infrastructure: number;
  /** Infraestructura en USD: congelado del libro (asientos de activo_fijo). */
  infrastructureUsd: number;
  moving: number; // dinero en movimiento = cash + inventory + CxC − CxP
  movingUsd: number;
  capitalTotal: number; // moving + infrastructure
  capitalTotalUsd: number;
};

/** Etapa del capital según el tipo de almacén. */
function stageOf(type: WarehouseType): "centro" | "almacen" | "puntos" {
  if (type === "centro_elaboracion") return "centro";
  if (type === "almacen_central") return "almacen";
  return "puntos"; // punto_venta, tienda_fisica, tienda_online
}

export async function capitalSnapshot(business: string): Promise<CapitalSnapshot> {
  const [balance, valuation, warehouses, assets, usdRate, contributions] = await Promise.all([
    trialBalance({ business }),
    stockValuation(),
    listWarehouses([business]),
    listFixedAssets(business),
    getRate("USD"),
    listContributions(business),
  ]);

  // Infraestructura desde la tabla fixed_assets (no del asiento): CUP guardado +
  // USD congelado por activo. Así la tarjeta coincide con la lista de activos sin
  // depender de que el asiento exista/esté fresco. Activos antiguos sin USD
  // congelado se aproximan con la última tasa.
  const infrastructure = Math.round(assets.reduce((s, a) => s + Number(a.amount), 0) * 100) / 100;
  const infrastructureUsd =
    Math.round(
      assets.reduce(
        (s, a) => s + (a.amount_usd != null ? Number(a.amount_usd) : usdRate && usdRate > 0 ? Number(a.amount) / usdRate : 0),
        0,
      ) * 100,
    ) / 100;

  const byCode = new Map(balance.map((r) => [r.account_code, r.balance]));
  const byCodeUsd = new Map(balance.map((r) => [r.account_code, r.balance_usd]));
  const cup = byCode.get(ACC_CAJA_CUP) ?? 0;
  const usd = byCodeUsd.get(ACC_CAJA_USD) ?? 0; // saldo real en dólares (congelado)
  const usdCup = usdRate != null && usdRate > 0 ? Math.round(usd * usdRate * 100) / 100 : null;
  const bank = byCode.get(ACC_BANCO) ?? 0;
  const cashTotalUsd =
    Math.round(((byCodeUsd.get(ACC_CAJA_CUP) ?? 0) + usd + (byCodeUsd.get(ACC_BANCO) ?? 0)) * 100) / 100;
  const receivables = byCode.get(ACC_CXC) ?? 0;
  const receivablesUsd = byCodeUsd.get(ACC_CXC) ?? 0;
  const payables = byCode.get(ACC_CXP) ?? 0;
  const payablesUsd = byCodeUsd.get(ACC_CXP) ?? 0;

  // Capital aportado por socios, por moneda de aporte (fuente: capital_contributions).
  const contributed = { cup: 0, usd: 0, total: 0 };
  for (const c of contributions) {
    if (c.currency === "USD") contributed.usd += c.amount;
    else contributed.cup += c.amount;
  }
  contributed.total = contributed.cup + (usdRate != null ? Math.round(contributed.usd * usdRate * 100) / 100 : 0);

  // Inventario FIFO del negocio (dual), agregado por almacén y por etapa.
  const valueByWarehouse = new Map<string, { cup: number; usd: number }>();
  for (const [key, v] of Object.entries(valuation)) {
    const warehouseId = key.split("::")[1];
    const cur = valueByWarehouse.get(warehouseId) ?? { cup: 0, usd: 0 };
    cur.cup += v.value;
    cur.usd += v.value_usd;
    valueByWarehouse.set(warehouseId, cur);
  }
  const inv = { centro: 0, almacen: 0, puntos: 0 };
  let inventoryTotalUsd = 0;
  const byWarehouse: CapitalSnapshot["inventory"]["byWarehouse"] = [];
  for (const w of warehouses) {
    const v = valueByWarehouse.get(w.id) ?? { cup: 0, usd: 0 };
    const value = Math.round(v.cup * 100) / 100;
    const valueUsd = Math.round(v.usd * 100) / 100;
    if (value !== 0 || valueUsd !== 0) {
      byWarehouse.push({ warehouse_id: w.id, name: w.name, type: w.type, value, valueUsd });
    }
    inv[stageOf(w.type)] += value;
    inventoryTotalUsd += valueUsd;
  }
  const inventoryTotal = inv.centro + inv.almacen + inv.puntos;
  inventoryTotalUsd = Math.round(inventoryTotalUsd * 100) / 100;

  // Total de efectivo en CUP: la caja USD entra convertida con la última tasa
  // (si no hay tasa, no entra al total — la UI avisa).
  const cashTotal = cup + (usdCup ?? 0) + bank;
  const moving = cashTotal + inventoryTotal + receivables - payables;
  const movingUsd =
    Math.round((cashTotalUsd + inventoryTotalUsd + receivablesUsd - payablesUsd) * 100) / 100;
  return {
    usdRate,
    cash: { cup, usd, usdCup, bank, total: cashTotal, totalUsd: cashTotalUsd },
    contributed,
    inventory: { ...inv, total: inventoryTotal, totalUsd: inventoryTotalUsd, byWarehouse },
    receivables,
    receivablesUsd,
    payables,
    payablesUsd,
    infrastructure,
    infrastructureUsd,
    moving,
    movingUsd,
    capitalTotal: moving + infrastructure,
    capitalTotalUsd: Math.round((movingUsd + infrastructureUsd) * 100) / 100,
  };
}

// ── Infraestructura (activos fijos) ─────────────────────────────────────

export const listFixedAssets = unstable_cache(
  async (business?: string): Promise<FixedAsset[]> => {
    const sb = getSupabase();
    let q = sb.from("fixed_assets").select("*").order("acquired_at", { ascending: false });
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as FixedAsset[]).map((a) => ({
      ...a,
      amount: Number(a.amount),
      amount_usd: a.amount_usd != null ? Number(a.amount_usd) : null,
    }));
  },
  ["fixed_assets"],
  { revalidate: 60, tags: [TAG] },
);

/**
 * Registra una inversión en infraestructura, congelando su equivalente USD a la
 * tasa del día (moneda funcional). El monto se captura en CUP o USD; `amount` se
 * guarda siempre en CUP y `amount_usd` es el USD real congelado. Genera el asiento
 * Infraestructura (1500) DEBE / Caja (1110 CUP | 1120 USD) HABER, dual CUP/USD.
 */
export async function addFixedAsset(input: {
  business_slug: string;
  name: string;
  amount: number;
  currency: "CUP" | "USD";
  acquired_at: string;
  notes?: string;
  created_by: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  const sb = getSupabase();

  // Montos duales congelados a la tasa del día (bloquea si está vieja).
  const rate = await assertFreshRate();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amountCup = input.currency === "USD" ? round2(input.amount * rate) : input.amount;
  const amountUsd = input.currency === "USD" ? input.amount : round2(input.amount / rate);

  const { data, error } = await sb
    .from("fixed_assets")
    .insert({
      business_slug: input.business_slug,
      name: input.name,
      amount: amountCup,
      amount_usd: amountUsd,
      currency: input.currency,
      acquired_at: input.acquired_at,
      notes: input.notes ?? "",
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    const cajaCode = input.currency === "USD" ? ACC_CAJA_USD : ACC_CAJA_CUP;
    const { data: accounts, error: aErr } = await sb
      .from("accounts")
      .select("id, code")
      .in("code", [ACC_INFRA, cajaCode]);
    if (aErr) throw aErr;
    const byCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
    const infra = byCode.get(ACC_INFRA);
    const caja = byCode.get(cajaCode);
    if (!infra || !caja) throw new Error(`Faltan cuentas ${ACC_INFRA}/${cajaCode} en el plan de cuentas.`);
    const entryId = await createJournalEntry({
      entry_date: input.acquired_at,
      description: `Infraestructura — ${input.name}`,
      reference_type: "activo_fijo",
      reference_id: data.id,
      business: input.business_slug,
      exchange_rate: rate,
      created_by: input.created_by,
      lines: [
        { account_id: infra, debit: amountCup, credit: 0, debit_usd: amountUsd, credit_usd: 0, description: input.name },
        { account_id: caja, debit: 0, credit: amountCup, debit_usd: 0, credit_usd: amountUsd, description: `Pago de infraestructura (${input.currency})` },
      ],
    });
    await sb.from("fixed_assets").update({ journal_entry_id: entryId }).eq("id", data.id);
  } catch (e) {
    console.error("[capital] asiento de activo fijo falló:", e);
  }
  bust();
}

/**
 * Elimina una inversión en infraestructura registrada por error y su asiento
 * asociado (lo descontabiliza si estaba contabilizado).
 */
export async function deleteFixedAsset(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: asset, error } = await sb
    .from("fixed_assets")
    .select("id, journal_entry_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!asset) return;
  if (asset.journal_entry_id) await forceDeleteJournalEntry(asset.journal_entry_id);
  const { error: dErr } = await sb.from("fixed_assets").delete().eq("id", id);
  if (dErr) throw dErr;
  bust();
}

// ── Ingresos y gastos manuales ───────────────────────────────────────────

/**
 * Registra un ingreso o gasto simple del negocio sin pasar por el editor de
 * asientos (requisito del cliente: "que en el capital me deje escribir los
 * ingresos y los gastos... y que eso vaya para su respectivo lado").
 *
 * Genera el asiento (borrador):
 *  - ingreso: Caja (1110 CUP | 1120 USD) DEBE / Otros ingresos (4900) HABER
 *  - gasto:   Otros gastos (5400) DEBE / Caja (1110 | 1120) HABER
 *
 * El monto se captura en la moneda de la caja elegida y el asiento queda DUAL:
 * la tasa del día congela el otro lado (USD funcional, migración 0040).
 */
export async function recordCashMovement(input: {
  business_slug: string;
  kind: "ingreso" | "gasto";
  amount: number;
  currency: "CUP" | "USD";
  concept: string;
  date: string;
  created_by: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  if (!input.concept.trim()) throw new Error("Escribe el concepto.");
  const sb = getSupabase();

  const cajaCode = input.currency === "USD" ? ACC_CAJA_USD : ACC_CAJA_CUP;
  const otherCode = input.kind === "ingreso" ? ACC_OTROS_INGRESOS : ACC_OTROS_GASTOS;
  const { data: accounts, error } = await sb
    .from("accounts")
    .select("id, code")
    .in("code", [cajaCode, otherCode]);
  if (error) throw error;
  const byCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
  const caja = byCode.get(cajaCode);
  const other = byCode.get(otherCode);
  if (!caja || !other) {
    throw new Error(`Faltan cuentas ${cajaCode}/${otherCode} en el plan de cuentas (aplicar migración 0037).`);
  }

  // Montos duales congelados a la tasa del día (bloquea si está vieja).
  const rate = await assertFreshRate();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amountCup = input.currency === "USD" ? round2(input.amount * rate) : input.amount;
  const amountUsd = input.currency === "USD" ? input.amount : round2(input.amount / rate);

  const cajaLine = { account_id: caja, description: `Caja ${input.currency}` };
  const otherLine = { account_id: other, description: input.concept };
  await createJournalEntry({
    entry_date: input.date,
    description: `${input.kind === "ingreso" ? "Ingreso" : "Gasto"} — ${input.concept}`,
    reference_type: "mov_caja",
    reference_id: crypto.randomUUID(),
    business: input.business_slug,
    exchange_rate: rate,
    created_by: input.created_by,
    lines:
      input.kind === "ingreso"
        ? [
            { ...cajaLine, debit: amountCup, credit: 0, debit_usd: amountUsd, credit_usd: 0 },
            { ...otherLine, debit: 0, credit: amountCup, debit_usd: 0, credit_usd: amountUsd },
          ]
        : [
            { ...otherLine, debit: amountCup, credit: 0, debit_usd: amountUsd, credit_usd: 0 },
            { ...cajaLine, debit: 0, credit: amountCup, debit_usd: 0, credit_usd: amountUsd },
          ],
  });
  bust();
}

export type CashMovementRow = {
  id: string;
  entry_date: string;
  description: string;
  /** Monto en CUP del asiento (lado debe). */
  amount: number;
  status: Database["public"]["Tables"]["journal_entries"]["Row"]["status"];
};

/**
 * Ingresos/gastos manuales recientes del negocio. No hay tabla propia: cada uno
 * ES un asiento con reference_type='mov_caja' (ver recordCashMovement).
 */
export const listCashMovements = unstable_cache(
  async (business: string, limit = 30): Promise<CashMovementRow[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("journal_entries")
      .select("id, entry_date, description, total_debit, status")
      .eq("reference_type", "mov_caja")
      .eq("business", business)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      entry_date: r.entry_date,
      description: r.description,
      amount: Number(r.total_debit),
      status: r.status,
    }));
  },
  ["cash_movements_list"],
  { revalidate: 30, tags: [TAG] },
);

/**
 * Elimina un ingreso/gasto manual = borra su asiento (lo descontabiliza si
 * estaba contabilizado).
 */
export async function deleteCashMovement(entryId: string): Promise<void> {
  await forceDeleteJournalEntry(entryId);
  bust();
}
