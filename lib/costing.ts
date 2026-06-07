import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { assertFreshRate } from "./currency";

// Costeo de inventario por lotes con consumo FIFO.
//
// Invariante: la suma de `qty_remaining` de los lotes de un (producto, almacén)
// es igual al `quantity` de stock_locations. Cada entrada crea un lote; cada
// salida consume lotes del más antiguo al más nuevo. Por eso el costeo se
// centraliza en createMovement (lib/inventory.ts), el único punto por el que
// pasan todos los cambios de stock.
//
// Nota de concurrencia: las operaciones no son transaccionales (supabase-js no
// expone transacciones). Para un único tenant con baja concurrencia es
// aceptable; si dos salidas del mismo producto coincidieran al milisegundo
// podrían consumir el mismo lote. No es el caso de esta operación.

const TAG = "costing";
export function bustCosting() {
  revalidateTag(TAG, "max");
}

export type Lot = {
  id: string;
  product_id: string;
  warehouse_id: string;
  unit_cost: number;
  /** Costo USD congelado a la tasa del día de la entrada (moneda funcional). */
  unit_cost_usd: number;
  /** Tasa USD→CUP usada al crear el lote (referencia). */
  rate: number | null;
  qty_received: number;
  qty_remaining: number;
  source_type: string;
  source_id: string | null;
  movement_id: string | null;
  received_at: string;
};

/** Crea un lote de entrada de stock con su costo unitario dual (CUP + USD congelado). */
export async function createLot(input: {
  product_id: string;
  warehouse_id: string;
  unit_cost: number;
  unit_cost_usd: number;
  rate?: number | null;
  quantity: number;
  source_type: string;
  source_id?: string | null;
  movement_id?: string | null;
}): Promise<void> {
  if (input.quantity <= 0) return;
  const sb = getSupabase();
  const { error } = await sb.from("inventory_lots").insert({
    product_id: input.product_id,
    warehouse_id: input.warehouse_id,
    unit_cost: Math.round(Math.max(0, input.unit_cost) * 100) / 100,
    unit_cost_usd: Math.round(Math.max(0, input.unit_cost_usd) * 100) / 100,
    rate: input.rate ?? null,
    qty_received: input.quantity,
    qty_remaining: input.quantity,
    source_type: input.source_type,
    source_id: input.source_id ?? null,
    movement_id: input.movement_id ?? null,
  });
  if (error) throw error;
}

/**
 * Consume `quantity` unidades por FIFO y devuelve el costo total consumido.
 * Registra cada consumo en inventory_lot_consumptions (trazabilidad + COGS).
 * Si no hay lotes suficientes (no debería pasar: el stock lo impide), consume
 * lo disponible y el remanente queda a costo 0.
 */
export async function consumeFIFO(input: {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  movement_id: string;
}): Promise<{ cost: number; cost_usd: number }> {
  const sb = getSupabase();
  let remaining = input.quantity;
  let cost = 0;
  let costUsd = 0;

  const { data: lots, error } = await sb
    .from("inventory_lots")
    .select("id, unit_cost, unit_cost_usd, qty_remaining")
    .eq("product_id", input.product_id)
    .eq("warehouse_id", input.warehouse_id)
    .gt("qty_remaining", 0)
    .order("received_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  for (const lot of lots ?? []) {
    if (remaining <= 0) break;
    const available = Number(lot.qty_remaining);
    const take = Math.min(remaining, available);
    const uc = Number(lot.unit_cost);
    const ucUsd = Number(lot.unit_cost_usd ?? 0);

    const { error: uErr } = await sb
      .from("inventory_lots")
      .update({ qty_remaining: available - take })
      .eq("id", lot.id);
    if (uErr) throw uErr;

    const { error: cErr } = await sb.from("inventory_lot_consumptions").insert({
      lot_id: lot.id,
      movement_id: input.movement_id,
      product_id: input.product_id,
      warehouse_id: input.warehouse_id,
      quantity: take,
      unit_cost: uc,
      unit_cost_usd: ucUsd,
    });
    if (cErr) throw cErr;

    cost += take * uc;
    costUsd += take * ucUsd;
    remaining -= take;
  }

  return {
    cost: Math.round(cost * 100) / 100,
    cost_usd: Math.round(costUsd * 100) / 100,
  };
}

/** Costo total registrado por las salidas de un movimiento (suma de consumos). */
export async function movementCost(movementId: string): Promise<number> {
  return (await movementCostDual(movementId)).cost;
}

/** Costo dual del movimiento: CUP histórico + USD congelado de los lotes. */
export async function movementCostDual(movementId: string): Promise<{ cost: number; cost_usd: number }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("inventory_lot_consumptions")
    .select("quantity, unit_cost, unit_cost_usd")
    .eq("movement_id", movementId);
  if (error) throw error;
  let cost = 0;
  let costUsd = 0;
  for (const r of data ?? []) {
    cost += Number(r.quantity) * Number(r.unit_cost);
    costUsd += Number(r.quantity) * Number(r.unit_cost_usd ?? 0);
  }
  return {
    cost: Math.round(cost * 100) / 100,
    cost_usd: Math.round(costUsd * 100) / 100,
  };
}

/** Costo promedio ponderado actual de un (producto, almacén) según lotes con saldo. */
export async function averageCost(product_id: string, warehouse_id: string): Promise<number> {
  return (await averageCostDual(product_id, warehouse_id)).cup;
}

/** Costo promedio dual (CUP histórico + USD congelado) de los lotes con saldo. */
export async function averageCostDual(
  product_id: string,
  warehouse_id: string,
): Promise<{ cup: number; usd: number }> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("inventory_lots")
    .select("unit_cost, unit_cost_usd, qty_remaining")
    .eq("product_id", product_id)
    .eq("warehouse_id", warehouse_id)
    .gt("qty_remaining", 0);
  if (error) throw error;
  let qty = 0;
  let value = 0;
  let valueUsd = 0;
  for (const l of data ?? []) {
    qty += Number(l.qty_remaining);
    value += Number(l.qty_remaining) * Number(l.unit_cost);
    valueUsd += Number(l.qty_remaining) * Number(l.unit_cost_usd ?? 0);
  }
  return {
    cup: qty > 0 ? Math.round((value / qty) * 100) / 100 : 0,
    usd: qty > 0 ? Math.round((valueUsd / qty) * 100) / 100 : 0,
  };
}

/**
 * Valuación por ubicación: costo promedio y valor (qty * costo) de cada
 * (producto, almacén) con saldo. Cacheado; se invalida con bustCosting().
 * Key del Map: `${product_id}::${warehouse_id}`.
 */
export const stockValuation = unstable_cache(
  async (): Promise<Record<string, { qty: number; avg_cost: number; value: number; value_usd: number }>> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("inventory_lots")
      .select("product_id, warehouse_id, unit_cost, unit_cost_usd, qty_remaining")
      .gt("qty_remaining", 0);
    if (error) throw error;
    const acc: Record<string, { qty: number; value: number; value_usd: number }> = {};
    for (const l of data ?? []) {
      const key = `${l.product_id}::${l.warehouse_id}`;
      const cur = acc[key] ?? { qty: 0, value: 0, value_usd: 0 };
      cur.qty += Number(l.qty_remaining);
      cur.value += Number(l.qty_remaining) * Number(l.unit_cost);
      cur.value_usd += Number(l.qty_remaining) * Number(l.unit_cost_usd ?? 0);
      acc[key] = cur;
    }
    const out: Record<string, { qty: number; avg_cost: number; value: number; value_usd: number }> = {};
    for (const [key, v] of Object.entries(acc)) {
      out[key] = {
        qty: v.qty,
        avg_cost: v.qty > 0 ? Math.round((v.value / v.qty) * 100) / 100 : 0,
        value: Math.round(v.value * 100) / 100,
        value_usd: Math.round(v.value_usd * 100) / 100,
      };
    }
    return out;
  },
  ["stock_valuation"],
  { revalidate: 30, tags: [TAG] },
);

export type LotRow = Lot & { product_name: string; warehouse_name: string };

/** Listado de lotes para la UI. Por defecto solo los que tienen saldo. */
export const listLots = unstable_cache(
  async (filter?: { warehouseId?: string; onlyRemaining?: boolean }): Promise<LotRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("inventory_lots")
      .select("*, products!inner(name), warehouses!inner(name)")
      .order("received_at", { ascending: false });
    if (filter?.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
    if (filter?.onlyRemaining) q = q.gt("qty_remaining", 0);
    const { data, error } = await q;
    if (error) throw error;
    type R = Lot & { products: { name: string } | null; warehouses: { name: string } | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      unit_cost: Number(r.unit_cost),
      unit_cost_usd: Number(r.unit_cost_usd ?? 0),
      qty_received: Number(r.qty_received),
      qty_remaining: Number(r.qty_remaining),
      product_name: r.products?.name ?? "",
      warehouse_name: r.warehouses?.name ?? "",
    }));
  },
  ["inventory_lots_list"],
  { revalidate: 30, tags: [TAG] },
);

/**
 * Ajusta el costo de un lote de apertura ('inicial') que aún no se ha consumido.
 * Solo se permite mientras el lote no haya tenido salidas, para no invalidar
 * COGS ya registrados.
 */
export async function setOpeningLotCost(lotId: string, unitCost: number): Promise<void> {
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Costo inválido.");
  const sb = getSupabase();
  const { data: lot, error } = await sb
    .from("inventory_lots")
    .select("source_type, qty_received, qty_remaining")
    .eq("id", lotId)
    .maybeSingle();
  if (error) throw error;
  if (!lot) throw new Error("Lote no encontrado.");
  if (lot.source_type !== "inicial") throw new Error("Solo se puede ajustar el costo de lotes de apertura.");
  if (Number(lot.qty_remaining) !== Number(lot.qty_received)) {
    throw new Error("No se puede ajustar: el lote ya tuvo salidas.");
  }
  // El costo se captura en CUP; el USD congelado se deriva con la tasa del día
  // (bloquea si la tasa está vieja — el costo USD del lote no puede quedar en 0).
  const rate = await assertFreshRate();
  const { error: uErr } = await sb
    .from("inventory_lots")
    .update({
      unit_cost: Math.round(unitCost * 100) / 100,
      unit_cost_usd: Math.round((unitCost / rate) * 100) / 100,
      rate,
    })
    .eq("id", lotId);
  if (uErr) throw uErr;
  bustCosting();
}
