import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createMovement } from "./inventory";
import { generatePurchaseEntry } from "./auto-accounting";
import { deleteEntriesByReference } from "./accounting";
import { createCatalogProduct } from "./products";
import { assertFreshRate } from "./currency";
import type { PurchaseOrderStatus } from "./supabase-types";

const TAG = "purchases";
function bust() {
  revalidateTag(TAG, "max");
  revalidateTag("inventory", "max");
}

// USD funcional: el costo de compra se captura EN USD (es la cifra real del
// negocio); el CUP se deriva con la tasa del día y queda congelado junto con
// la tasa en la orden. El FIFO recibe ambos costos.

export type PurchaseLineInput = {
  /** Vacío cuando la línea trae new_product (se crea el producto al vuelo). */
  product_id: string;
  quantity: number;
  /** Costo unitario en USD (moneda funcional). */
  unit_cost_usd: number;
  /** Producto nuevo a crear antes de la orden: sin tienda (solo almacén), no visible online. */
  new_product?: { name: string; price_usd: number | null };
};

/**
 * Crea los productos nuevos de las líneas (requisito del cliente: poder
 * comprar productos que aún no existen y que entren al almacén) y devuelve
 * las líneas con todos los product_id resueltos.
 */
async function resolveNewProducts(lines: PurchaseLineInput[]): Promise<PurchaseLineInput[]> {
  const resolved: PurchaseLineInput[] = [];
  for (const l of lines) {
    if (!l.new_product) {
      resolved.push(l);
      continue;
    }
    const id = await createCatalogProduct({
      name: l.new_product.name,
      description: "",
      price: l.new_product.price_usd ?? 0,
      price_eur: null,
      old_price: null,
      image: "",
      category: null,
      store: null,
      shipping_time: null,
      featured: false,
      is_new: false,
      online_visible: false,
    });
    resolved.push({ ...l, product_id: id, new_product: undefined });
  }
  return resolved;
}

export type PurchaseOrderSummary = {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  warehouse_name: string;
  reference: string;
  total_amount: number;
  line_count: number;
  created_at: string;
  received_at: string | null;
};

type PORawRow = {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  supplier_id: string;
  warehouse_id: string;
  reference: string;
  total_amount: number;
  created_at: string;
  received_at: string | null;
  suppliers: { name: string } | null;
  warehouses: { name: string } | null;
  purchase_order_lines: { id: string }[] | null;
};

export const listPurchaseOrders = unstable_cache(
  async (filter?: { status?: PurchaseOrderStatus; scope?: string[] }): Promise<PurchaseOrderSummary[]> => {
    const sb = getSupabase();
    let q = sb
      .from("purchase_orders")
      .select(
        "id,code,status,supplier_id,warehouse_id,reference,total_amount,created_at,received_at,suppliers!inner(name),warehouses!inner(name,store_slug),purchase_order_lines(id)",
      )
      .order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.scope) q = q.in("warehouses.store_slug", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as PORawRow[];
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      supplier_id: r.supplier_id,
      supplier_name: r.suppliers?.name ?? "",
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouses?.name ?? "",
      reference: r.reference,
      total_amount: Number(r.total_amount),
      line_count: (r.purchase_order_lines ?? []).length,
      created_at: r.created_at,
      received_at: r.received_at,
    }));
  },
  ["purchase_orders_listing"],
  { revalidate: 30, tags: [TAG] },
);

export type PurchaseLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_cost_usd: number | null;
  line_total: number;
  position: number;
};

export type PurchaseOrderDetail = {
  id: string;
  code: string;
  status: PurchaseOrderStatus;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_store: string | null;
  reference: string;
  notes: string;
  /** true = pagada de contado (baja la caja del negocio); false = a crédito. */
  paid_cash: boolean;
  /** Moneda del pago de contado (USD → Caja USD; CUP → Caja CUP). */
  payment_currency: "CUP" | "USD";
  total_amount: number;
  /** Tasa USD→CUP congelada al crear la orden. */
  rate: number | null;
  /** Total en USD (moneda funcional) congelado. */
  total_usd: number | null;
  created_at: string;
  received_at: string | null;
  movement_id: string | null;
  lines: PurchaseLine[];
};

export async function getPurchaseOrder(id: string, scope?: string[]): Promise<PurchaseOrderDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      "id,code,status,supplier_id,warehouse_id,reference,notes,paid_cash,payment_currency,total_amount,rate,total_usd,created_at,received_at,movement_id,suppliers!inner(name),warehouses!inner(name,store_slug)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const wStore = (data as unknown as { warehouses: { store_slug: string | null } | null }).warehouses?.store_slug ?? null;
  if (scope && (!wStore || !scope.includes(wStore))) return null;

  const { data: rawLines, error: lErr } = await sb
    .from("purchase_order_lines")
    .select("id,product_id,quantity,unit_cost,unit_cost_usd,line_total,position,products!inner(name)")
    .eq("purchase_order_id", id)
    .order("position");
  if (lErr) throw lErr;

  type LineRaw = {
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
    unit_cost_usd: number | null;
    line_total: number;
    position: number;
    products: { name: string } | null;
  };
  const lines: PurchaseLine[] = ((rawLines ?? []) as unknown as LineRaw[]).map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.products?.name ?? "",
    quantity: r.quantity,
    unit_cost: Number(r.unit_cost),
    unit_cost_usd: r.unit_cost_usd == null ? null : Number(r.unit_cost_usd),
    line_total: Number(r.line_total),
    position: r.position,
  }));

  const d = data as unknown as {
    id: string;
    code: string;
    status: PurchaseOrderStatus;
    supplier_id: string;
    warehouse_id: string;
    reference: string;
    notes: string;
    paid_cash: boolean;
    payment_currency: "CUP" | "USD" | null;
    total_amount: number;
    rate: number | null;
    total_usd: number | null;
    created_at: string;
    received_at: string | null;
    movement_id: string | null;
    suppliers: { name: string } | null;
    warehouses: { name: string; store_slug: string | null } | null;
  };

  return {
    id: d.id,
    code: d.code,
    status: d.status,
    supplier_id: d.supplier_id,
    supplier_name: d.suppliers?.name ?? "",
    warehouse_id: d.warehouse_id,
    warehouse_name: d.warehouses?.name ?? "",
    warehouse_store: d.warehouses?.store_slug ?? null,
    reference: d.reference,
    notes: d.notes,
    paid_cash: d.paid_cash ?? false,
    payment_currency: d.payment_currency ?? "USD",
    total_amount: Number(d.total_amount),
    rate: d.rate == null ? null : Number(d.rate),
    total_usd: d.total_usd == null ? null : Number(d.total_usd),
    created_at: d.created_at,
    received_at: d.received_at,
    movement_id: d.movement_id,
    lines,
  };
}

export async function createPurchaseOrder(input: {
  supplier_id: string;
  warehouse_id: string;
  reference: string;
  notes: string;
  /** true = pagada de contado (baja la caja del negocio); false = a crédito. */
  paid_cash: boolean;
  /** Moneda del pago de contado (USD → Caja USD; CUP → Caja CUP). */
  payment_currency?: "CUP" | "USD";
  created_by: string | null;
  lines: PurchaseLineInput[];
}): Promise<string> {
  if (input.lines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  // Tasa del día congelada en la orden (bloquea si está vieja).
  const rate = await assertFreshRate();
  const lines = await resolveNewProducts(input.lines);
  const totalUsd = round2(lines.reduce((s, l) => s + l.quantity * l.unit_cost_usd, 0));
  const sb = getSupabase();
  const { data: po, error } = await sb
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplier_id,
      warehouse_id: input.warehouse_id,
      reference: input.reference,
      notes: input.notes,
      paid_cash: input.paid_cash,
      payment_currency: input.payment_currency ?? "USD",
      rate,
      total_usd: totalUsd,
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  const payload = lines.map((l, i) => ({
    purchase_order_id: po.id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_cost: round6(l.unit_cost_usd * rate),
    unit_cost_usd: round6(l.unit_cost_usd),
    position: i,
  }));
  const { error: lErr } = await sb.from("purchase_order_lines").insert(payload);
  if (lErr) {
    await sb.from("purchase_orders").delete().eq("id", po.id);
    throw lErr;
  }
  bust();
  return po.id;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Costos/precios UNITARIOS a 6 decimales (los totales siguen a 2). */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export async function updatePurchaseOrderHeader(
  id: string,
  patch: { supplier_id?: string; warehouse_id?: string; reference?: string; notes?: string; paid_cash?: boolean; payment_currency?: "CUP" | "USD" },
): Promise<void> {
  const sb = getSupabase();
  // Solo se permite si está en borrador (validado en el server action)
  const { error } = await sb.from("purchase_orders").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function replacePurchaseOrderLines(
  id: string,
  inputLines: PurchaseLineInput[],
): Promise<void> {
  if (inputLines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  // Editar líneas re-congela la tasa del día (los costos USD son los pactados).
  const rate = await assertFreshRate();
  const lines = await resolveNewProducts(inputLines);
  const totalUsd = round2(lines.reduce((s, l) => s + l.quantity * l.unit_cost_usd, 0));
  const sb = getSupabase();
  const { error: dErr } = await sb.from("purchase_order_lines").delete().eq("purchase_order_id", id);
  if (dErr) throw dErr;
  const payload = lines.map((l, i) => ({
    purchase_order_id: id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_cost: round6(l.unit_cost_usd * rate),
    unit_cost_usd: round6(l.unit_cost_usd),
    position: i,
  }));
  const { error } = await sb.from("purchase_order_lines").insert(payload);
  if (error) throw error;
  const { error: hErr } = await sb.from("purchase_orders").update({ rate, total_usd: totalUsd }).eq("id", id);
  if (hErr) throw hErr;
  bust();
}

export async function receivePurchaseOrder(id: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const po = await getPurchaseOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "borrador") throw new Error(`No se puede recibir una orden en estado ${po.status}.`);
  if (po.lines.length === 0) throw new Error("La orden no tiene líneas.");

  // Crear el movimiento de entrada con costo dual; los lotes congelan el USD
  // pactado en la orden (la tasa de la orden, no la del día de recepción).
  const movementId = await createMovement({
    type: "entrada",
    warehouse_from: null,
    warehouse_to: po.warehouse_id,
    reference_type: "compra",
    reference_id: po.id,
    user_id: userId,
    notes: `Recepción ${po.code}${po.reference ? ` — fact. ${po.reference}` : ""}`,
    rate: po.rate,
    lines: po.lines.map((l) => ({
      product_id: l.product_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      unit_cost_usd: l.unit_cost_usd,
    })),
  });

  const { error } = await sb
    .from("purchase_orders")
    .update({
      status: "recibida",
      received_by: userId,
      received_at: new Date().toISOString(),
      movement_id: movementId,
    })
    .eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador): Inventario / Cuentas por pagar,
  // con el USD congelado de la orden.
  await generatePurchaseEntry({
    purchaseId: po.id,
    code: po.code,
    supplierName: po.supplier_name,
    total: po.total_amount,
    totalUsd: po.total_usd,
    rate: po.rate,
    paidCash: po.paid_cash,
    paymentCurrency: po.payment_currency,
    business: po.warehouse_store,
    date: new Date().toISOString().slice(0, 10),
    userId,
  });
  bust();
}

export async function cancelPurchaseOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const po = await getPurchaseOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "borrador") throw new Error("Solo se pueden cancelar órdenes en borrador.");
  const { error } = await sb.from("purchase_orders").update({ status: "cancelada" }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const po = await getPurchaseOrder(id);
  if (!po) return;
  if (po.status === "recibida") {
    throw new Error("La orden está recibida. Anula primero la recepción (vuelve a borrador) y luego elimínala.");
  }
  const { error } = await sb.from("purchase_orders").delete().eq("id", id);
  if (error) throw error;
  bust();
}

/**
 * Anula la recepción de una orden recibida por error: revierte el stock, borra
 * los lotes y el asiento de compra (lo descontabiliza si estaba contabilizado),
 * y devuelve la orden a borrador (así se puede editar o eliminar). Solo es
 * seguro si la mercancía recibida NO se ha vendido ni movido (lotes intactos);
 * si no, hay que corregir con un ajuste de inventario.
 */
export async function undoReceivePurchaseOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const po = await getPurchaseOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "recibida") throw new Error("Solo se puede anular la recepción de una orden recibida.");
  if (!po.movement_id) throw new Error("La orden no tiene movimiento de inventario asociado.");

  // 1. La mercancía recibida no se puede haber consumido (lotes intactos).
  const { data: lots, error: lErr } = await sb
    .from("inventory_lots")
    .select("id, qty_received, qty_remaining")
    .eq("movement_id", po.movement_id);
  if (lErr) throw lErr;
  for (const lot of lots ?? []) {
    if (Number(lot.qty_remaining) !== Number(lot.qty_received)) {
      throw new Error("No se puede anular: parte de esta mercancía ya se vendió o se movió. Corrige con un ajuste de inventario.");
    }
  }

  // 2. Borra el asiento de compra (lo descontabiliza si estaba contabilizado).
  await deleteEntriesByReference("compra", po.id);

  // 3. Revierte el stock del almacén destino (el trigger solo aplica en alta, no
  //    en baja): resta las cantidades recibidas, agregadas por producto.
  const byProduct = new Map<string, number>();
  for (const l of po.lines) byProduct.set(l.product_id, (byProduct.get(l.product_id) ?? 0) + l.quantity);
  for (const [productId, qty] of byProduct) {
    const { data: stock, error: sErr } = await sb
      .from("stock_locations")
      .select("quantity")
      .eq("product_id", productId)
      .eq("warehouse_id", po.warehouse_id)
      .maybeSingle();
    if (sErr) throw sErr;
    const current = Number(stock?.quantity ?? 0);
    const { error: uErr } = await sb
      .from("stock_locations")
      .update({ quantity: current - qty })
      .eq("product_id", productId)
      .eq("warehouse_id", po.warehouse_id);
    if (uErr) throw uErr;
  }

  // 4. Borra los lotes de esta recepción (movement_id es on delete set null, no cascade).
  const { error: dlErr } = await sb.from("inventory_lots").delete().eq("movement_id", po.movement_id);
  if (dlErr) throw dlErr;

  // 5. Borra el movimiento (cascade borra sus líneas).
  const { error: dmErr } = await sb.from("inventory_movements").delete().eq("id", po.movement_id);
  if (dmErr) throw dmErr;

  // 6. Devuelve la orden a borrador.
  const { error: poErr } = await sb
    .from("purchase_orders")
    .update({ status: "borrador", received_at: null, received_by: null, movement_id: null })
    .eq("id", id);
  if (poErr) throw poErr;

  bust();
  revalidateTag("costing", "max");
}

export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  borrador: "Borrador",
  recibida: "Recibida",
  cancelada: "Cancelada",
};

export const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  borrador: "bg-muted text-muted-foreground",
  recibida: "bg-success/10 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};
