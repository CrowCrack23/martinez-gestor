import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createJournalEntry, trialBalance } from "./accounting";
import { stockValuation } from "./costing";
import { listWarehouses } from "./warehouses";
import { getRate } from "./currency";
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
  // usd está en USD nativo; usdCup es su equivalente CUP (null sin tasa).
  // total está en CUP (la caja USD entra convertida; 0 si no hay tasa).
  cash: { cup: number; usd: number; usdCup: number | null; bank: number; total: number };
  /** Capital aportado por los socios (saldo 3100 + desglose por moneda de los aportes). */
  contributed: { cup: number; usd: number; total: number };
  inventory: {
    centro: number; // insumos / en elaboración (centro_elaboracion)
    almacen: number; // producto terminado (almacen_central)
    puntos: number; // mercancía en puntos de venta / tiendas
    total: number;
    byWarehouse: { warehouse_id: string; name: string; type: WarehouseType; value: number }[];
  };
  receivables: number;
  payables: number;
  infrastructure: number;
  moving: number; // dinero en movimiento = cash + inventory + CxC − CxP
  capitalTotal: number; // moving + infrastructure
};

/** Etapa del capital según el tipo de almacén. */
function stageOf(type: WarehouseType): "centro" | "almacen" | "puntos" {
  if (type === "centro_elaboracion") return "centro";
  if (type === "almacen_central") return "almacen";
  return "puntos"; // punto_venta, tienda_fisica, tienda_online
}

export async function capitalSnapshot(business: string): Promise<CapitalSnapshot> {
  const [balance, valuation, warehouses, infrastructure, usdRate, contributions] = await Promise.all([
    trialBalance({ business }),
    stockValuation(),
    listWarehouses([business]),
    sumFixedAssets(business),
    getRate("USD"),
    listContributions(business),
  ]);

  const byCode = new Map(balance.map((r) => [r.account_code, r.balance]));
  const cup = byCode.get(ACC_CAJA_CUP) ?? 0;
  const usd = byCode.get(ACC_CAJA_USD) ?? 0; // saldo nativo en USD
  const usdCup = usdRate != null && usdRate > 0 ? Math.round(usd * usdRate * 100) / 100 : null;
  const bank = byCode.get(ACC_BANCO) ?? 0;
  const receivables = byCode.get(ACC_CXC) ?? 0;
  const payables = byCode.get(ACC_CXP) ?? 0;

  // Capital aportado por socios, por moneda de aporte (fuente: capital_contributions).
  const contributed = { cup: 0, usd: 0, total: 0 };
  for (const c of contributions) {
    if (c.currency === "USD") contributed.usd += c.amount;
    else contributed.cup += c.amount;
  }
  contributed.total = contributed.cup + (usdRate != null ? Math.round(contributed.usd * usdRate * 100) / 100 : 0);

  // Inventario FIFO del negocio, agregado por almacén y por etapa.
  const valueByWarehouse = new Map<string, number>();
  for (const [key, v] of Object.entries(valuation)) {
    const warehouseId = key.split("::")[1];
    valueByWarehouse.set(warehouseId, (valueByWarehouse.get(warehouseId) ?? 0) + v.value);
  }
  const inv = { centro: 0, almacen: 0, puntos: 0 };
  const byWarehouse: CapitalSnapshot["inventory"]["byWarehouse"] = [];
  for (const w of warehouses) {
    const value = Math.round((valueByWarehouse.get(w.id) ?? 0) * 100) / 100;
    if (value !== 0) byWarehouse.push({ warehouse_id: w.id, name: w.name, type: w.type, value });
    inv[stageOf(w.type)] += value;
  }
  const inventoryTotal = inv.centro + inv.almacen + inv.puntos;

  // Total de efectivo en CUP: la caja USD entra convertida con la última tasa
  // (si no hay tasa, no entra al total — la UI avisa).
  const cashTotal = cup + (usdCup ?? 0) + bank;
  const moving = cashTotal + inventoryTotal + receivables - payables;
  return {
    usdRate,
    cash: { cup, usd, usdCup, bank, total: cashTotal },
    contributed,
    inventory: { ...inv, total: inventoryTotal, byWarehouse },
    receivables,
    payables,
    infrastructure,
    moving,
    capitalTotal: moving + infrastructure,
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
    return ((data ?? []) as FixedAsset[]).map((a) => ({ ...a, amount: Number(a.amount) }));
  },
  ["fixed_assets"],
  { revalidate: 60, tags: [TAG] },
);

async function sumFixedAssets(business: string): Promise<number> {
  const assets = await listFixedAssets(business);
  return assets.reduce((s, a) => s + a.amount, 0);
}

/**
 * Registra una inversión en infraestructura y genera (best-effort) el asiento
 * Infraestructura (1500) DEBE / Caja CUP (1110) HABER.
 */
export async function addFixedAsset(input: {
  business_slug: string;
  name: string;
  amount: number;
  acquired_at: string;
  notes?: string;
  created_by: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Monto inválido.");
  const sb = getSupabase();
  const { data, error } = await sb
    .from("fixed_assets")
    .insert({
      business_slug: input.business_slug,
      name: input.name,
      amount: input.amount,
      acquired_at: input.acquired_at,
      notes: input.notes ?? "",
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    const { data: accounts, error: aErr } = await sb
      .from("accounts")
      .select("id, code")
      .in("code", [ACC_INFRA, ACC_CAJA_CUP]);
    if (aErr) throw aErr;
    const byCode = new Map((accounts ?? []).map((a) => [a.code, a.id]));
    const infra = byCode.get(ACC_INFRA);
    const caja = byCode.get(ACC_CAJA_CUP);
    if (!infra || !caja) throw new Error("Faltan cuentas 1500/1110 en el plan de cuentas (aplicar migración 0031).");
    const entryId = await createJournalEntry({
      entry_date: input.acquired_at,
      description: `Infraestructura — ${input.name}`,
      reference_type: "activo_fijo",
      reference_id: data.id,
      business: input.business_slug,
      created_by: input.created_by,
      lines: [
        { account_id: infra, debit: input.amount, credit: 0, description: input.name },
        { account_id: caja, debit: 0, credit: input.amount, description: "Pago de infraestructura" },
      ],
    });
    await sb.from("fixed_assets").update({ journal_entry_id: entryId }).eq("id", data.id);
  } catch (e) {
    console.error("[capital] asiento de activo fijo falló:", e);
  }
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
 * El monto va en la moneda de la caja elegida (la 1120 se lleva en USD).
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

  const cajaLine = { account_id: caja, description: `Caja ${input.currency}` };
  const otherLine = { account_id: other, description: input.concept };
  await createJournalEntry({
    entry_date: input.date,
    description: `${input.kind === "ingreso" ? "Ingreso" : "Gasto"} — ${input.concept}`,
    reference_type: "mov_caja",
    reference_id: crypto.randomUUID(),
    business: input.business_slug,
    created_by: input.created_by,
    lines:
      input.kind === "ingreso"
        ? [
            { ...cajaLine, debit: input.amount, credit: 0 },
            { ...otherLine, debit: 0, credit: input.amount },
          ]
        : [
            { ...otherLine, debit: input.amount, credit: 0 },
            { ...cajaLine, debit: 0, credit: input.amount },
          ],
  });
  bust();
}
