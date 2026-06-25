import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createMovement } from "./inventory";
import { movementCostDual } from "./costing";
import { generateSaleEntry } from "./auto-accounting";
import { deleteEntriesByReference } from "./accounting";
import { assertRateForDate, priceCupFromUsd } from "./currency";
import type { OrderCurrency, OrderOrigin, OrderStatus, PaymentMethod } from "./supabase-types";

const TAG = "sales";
function bust() {
  revalidateTag(TAG, "max");
  revalidateTag("inventory", "max");
}

export type OrderLineInput = { product_id: string; quantity: number; unit_price: number };

export type OrderSummary = {
  id: string;
  code: string;
  status: OrderStatus;
  origin: OrderOrigin;
  customer_id: string | null;
  customer_name: string | null;
  warehouse_id: string;
  warehouse_name: string;
  payment_method: PaymentMethod;
  currency: OrderCurrency;
  amount_usd: number | null;
  reference: string;
  total_amount: number;
  payment_status: string;
  line_count: number;
  created_at: string;
  confirmed_at: string | null;
};

type OrderRawRow = {
  id: string;
  code: string;
  status: OrderStatus;
  origin: OrderOrigin;
  customer_id: string | null;
  warehouse_id: string;
  payment_method: PaymentMethod;
  currency: OrderCurrency;
  amount_usd: number | null;
  reference: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
  confirmed_at: string | null;
  customers: { name: string } | null;
  warehouses: { name: string } | null;
  order_lines: { id: string }[] | null;
};

export const listOrders = unstable_cache(
  async (filter?: { status?: OrderStatus; origin?: OrderOrigin; scope?: string[] }): Promise<OrderSummary[]> => {
    const sb = getSupabase();
    let q = sb
      .from("orders")
      .select(
        "id,code,status,origin,customer_id,warehouse_id,payment_method,currency,amount_usd,reference,total_amount,payment_status,created_at,confirmed_at,customers(name),warehouses!inner(name,store_slug),order_lines(id)",
      )
      .order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.origin) q = q.eq("origin", filter.origin);
    // scope: limitar a ventas cuyo almacén pertenece a las tiendas del usuario.
    if (filter?.scope) q = q.in("warehouses.store_slug", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as OrderRawRow[];
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      origin: r.origin,
      customer_id: r.customer_id,
      customer_name: r.customers?.name ?? null,
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouses?.name ?? "",
      payment_method: r.payment_method,
      currency: r.currency ?? "CUP",
      amount_usd: r.amount_usd != null ? Number(r.amount_usd) : null,
      reference: r.reference,
      total_amount: Number(r.total_amount),
      payment_status: r.payment_status ?? "no_aplica",
      line_count: (r.order_lines ?? []).length,
      created_at: r.created_at,
      confirmed_at: r.confirmed_at,
    }));
  },
  ["orders_listing"],
  { revalidate: 30, tags: [TAG] },
);

export type OrderLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  position: number;
};

export type OrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  origin: OrderOrigin;
  customer_id: string | null;
  customer_name: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_store: string | null;
  payment_method: PaymentMethod;
  currency: OrderCurrency;
  amount_usd: number | null;
  sale_rate: number | null;
  cogs_total: number;
  reference: string;
  notes: string;
  total_amount: number;
  payment_status: string;
  amount_charged: number | null;
  charge_currency: string | null;
  operation_date: string;
  created_at: string;
  confirmed_at: string | null;
  movement_id: string | null;
  lines: OrderLine[];
};

export async function getOrder(id: string, scope?: string[]): Promise<OrderDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("orders")
    .select(
      "id,code,status,origin,customer_id,warehouse_id,payment_method,currency,amount_usd,sale_rate,cogs_total,reference,notes,total_amount,payment_status,amount_charged,charge_currency,operation_date,created_at,confirmed_at,movement_id,customers(name),warehouses!inner(name,store_slug)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as unknown as {
    id: string; code: string; status: OrderStatus; origin: OrderOrigin;
    customer_id: string | null; warehouse_id: string; payment_method: PaymentMethod;
    currency: OrderCurrency; amount_usd: number | null; sale_rate: number | null; cogs_total: number;
    reference: string; notes: string; total_amount: number;
    payment_status: string; amount_charged: number | null; charge_currency: string | null;
    operation_date: string;
    created_at: string; confirmed_at: string | null; movement_id: string | null;
    customers: { name: string } | null; warehouses: { name: string; store_slug: string | null } | null;
  };
  // scope: si el usuario está limitado a ciertas tiendas y esta venta no pertenece, ocultar.
  if (scope && (!d.warehouses?.store_slug || !scope.includes(d.warehouses.store_slug))) {
    return null;
  }

  const { data: rawLines, error: lErr } = await sb
    .from("order_lines")
    .select("id,product_id,quantity,unit_price,line_total,position,products!inner(name)")
    .eq("order_id", id)
    .order("position");
  if (lErr) throw lErr;
  type LineRaw = {
    id: string; product_id: string; quantity: number; unit_price: number;
    line_total: number; position: number; products: { name: string } | null;
  };
  const lines: OrderLine[] = ((rawLines ?? []) as unknown as LineRaw[]).map((r) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.products?.name ?? "",
    quantity: r.quantity,
    unit_price: Number(r.unit_price),
    line_total: Number(r.line_total),
    position: r.position,
  }));

  return {
    id: d.id,
    code: d.code,
    status: d.status,
    origin: d.origin,
    customer_id: d.customer_id,
    customer_name: d.customers?.name ?? null,
    warehouse_id: d.warehouse_id,
    warehouse_name: d.warehouses?.name ?? "",
    warehouse_store: d.warehouses?.store_slug ?? null,
    payment_method: d.payment_method,
    currency: d.currency ?? "CUP",
    amount_usd: d.amount_usd != null ? Number(d.amount_usd) : null,
    sale_rate: d.sale_rate != null ? Number(d.sale_rate) : null,
    cogs_total: Number(d.cogs_total ?? 0),
    reference: d.reference,
    notes: d.notes,
    total_amount: Number(d.total_amount),
    payment_status: d.payment_status ?? "no_aplica",
    amount_charged: d.amount_charged != null ? Number(d.amount_charged) : null,
    charge_currency: d.charge_currency,
    operation_date: d.operation_date,
    created_at: d.created_at,
    confirmed_at: d.confirmed_at,
    movement_id: d.movement_id,
    lines,
  };
}

export async function createOrder(input: {
  customer_id: string | null;
  warehouse_id: string;
  origin: OrderOrigin;
  payment_method: PaymentMethod;
  currency?: OrderCurrency;
  reference: string;
  notes: string;
  /** Fecha de la operación (YYYY-MM-DD); por defecto, hoy. */
  operation_date?: string;
  created_by: string | null;
  lines: OrderLineInput[];
}): Promise<string> {
  if (input.lines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  const sb = getSupabase();
  const { data, error } = await sb
    .from("orders")
    .insert({
      customer_id: input.customer_id,
      warehouse_id: input.warehouse_id,
      origin: input.origin,
      payment_method: input.payment_method,
      currency: input.currency ?? "CUP",
      reference: input.reference,
      notes: input.notes,
      operation_date: input.operation_date ?? new Date().toISOString().slice(0, 10),
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  const payload = input.lines.map((l, i) => ({
    order_id: data.id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    position: i,
  }));
  const { error: lErr } = await sb.from("order_lines").insert(payload);
  if (lErr) {
    await sb.from("orders").delete().eq("id", data.id);
    throw lErr;
  }
  bust();
  return data.id;
}

export async function updateOrderHeader(
  id: string,
  patch: {
    customer_id?: string | null;
    warehouse_id?: string;
    origin?: OrderOrigin;
    payment_method?: PaymentMethod;
    currency?: OrderCurrency;
    reference?: string;
    notes?: string;
    operation_date?: string;
  },
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("orders").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function replaceOrderLines(id: string, lines: OrderLineInput[]): Promise<void> {
  if (lines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  const sb = getSupabase();
  const { error: dErr } = await sb.from("order_lines").delete().eq("order_id", id);
  if (dErr) throw dErr;
  const payload = lines.map((l, i) => ({
    order_id: id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_price: l.unit_price,
    position: i,
  }));
  const { error } = await sb.from("order_lines").insert(payload);
  if (error) throw error;
  bust();
}

export async function confirmOrder(id: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const o = await getOrder(id);
  if (!o) throw new Error("Orden no encontrada.");
  if (o.status !== "borrador") throw new Error(`No se puede confirmar una orden en estado ${o.status}.`);
  if (o.lines.length === 0) throw new Error("La orden no tiene líneas.");

  // USD funcional: tasa vigente en la FECHA de la venta (no la de hoy) y precios
  // recalculados desde el precio USD del producto (espejo de confirm_pos_order).
  const rate = await assertRateForDate(o.operation_date);

  const productIds = Array.from(new Set(o.lines.map((l) => l.product_id)));
  const { data: prods, error: pErr } = await sb
    .from("products")
    .select("id, price")
    .in("id", productIds);
  if (pErr) throw pErr;
  const priceUsdById = new Map((prods ?? []).map((p) => [p.id as string, Number(p.price)]));
  for (const l of o.lines) {
    const priceUsd = priceUsdById.get(l.product_id);
    if (!priceUsd || priceUsd <= 0) {
      throw new Error(`El producto "${l.product_name}" no tiene precio USD definido; ponlo en /productos antes de vender.`);
    }
    const { error: uErr } = await sb
      .from("order_lines")
      .update({ unit_price: priceCupFromUsd(priceUsd, rate), unit_price_usd: priceUsd })
      .eq("id", l.id);
    if (uErr) throw uErr;
  }
  // Total repreciado por el trigger de líneas.
  const { data: fresh, error: tErr } = await sb
    .from("orders")
    .select("total_amount")
    .eq("id", id)
    .single();
  if (tErr) throw tErr;
  const total = Number(fresh.total_amount ?? 0);
  const amountUsd = Math.round((total / rate) * 100) / 100;

  const movementId = await createMovement({
    type: "salida",
    warehouse_from: o.warehouse_id,
    warehouse_to: null,
    reference_type: "venta",
    reference_id: o.id,
    user_id: userId,
    notes: `Venta ${o.code}${o.reference ? ` — ref. ${o.reference}` : ""}`,
    operation_date: o.operation_date,
    // Sin unit_cost: el costo real de la salida lo calcula el costeo FIFO por lotes.
    lines: o.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
  });

  // COGS dual congelado al confirmar (CUP histórico + USD real de los lotes).
  const { cost: cogs, cost_usd: cogsUsd } = await movementCostDual(movementId);

  const { error } = await sb
    .from("orders")
    .update({
      status: "confirmada",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      movement_id: movementId,
      cogs_total: cogs,
      cogs_usd: cogsUsd,
      sale_rate: rate,
      amount_usd: amountUsd,
    })
    .eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador), dual CUP/USD (ver auto-accounting).
  await generateSaleEntry({
    orderId: o.id,
    code: o.code,
    customerName: o.customer_name,
    total,
    paymentMethod: o.payment_method,
    currency: o.currency,
    origin: o.origin,
    movementId,
    business: o.warehouse_store,
    date: o.operation_date,
    userId,
    rate,
    amountUsd,
    cogsUsd,
  });
  bust();
}

export async function cancelOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const o = await getOrder(id);
  if (!o) throw new Error("Orden no encontrada.");
  if (o.status !== "borrador") throw new Error("Solo se pueden cancelar órdenes en borrador.");
  const { error } = await sb.from("orders").update({ status: "cancelada" }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const o = await getOrder(id);
  if (!o) return;
  if (o.status === "confirmada") {
    throw new Error("La venta está confirmada. Anula primero la confirmación (vuelve a borrador) y luego elimínala.");
  }
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) throw error;
  bust();
}

/**
 * Anula la confirmación de una venta confirmada por error: devuelve a su lote
 * cada unidad consumida por FIFO, repone el stock, borra el asiento de venta y
 * el movimiento de salida, y deja la orden en borrador (para corregir o
 * eliminar). Descontabiliza el asiento de venta si estaba contabilizado.
 */
export async function undoConfirmOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const o = await getOrder(id);
  if (!o) throw new Error("Orden no encontrada.");
  if (o.status !== "confirmada") throw new Error("Solo se puede anular la confirmación de una venta confirmada.");
  if (!o.movement_id) throw new Error("La venta no tiene movimiento de inventario asociado.");

  // 1. Borra el asiento de venta (lo descontabiliza si estaba contabilizado).
  await deleteEntriesByReference("venta", o.id);

  // 2. Devuelve a cada lote las unidades que esta salida consumió por FIFO.
  const { data: consumptions, error: cErr } = await sb
    .from("inventory_lot_consumptions")
    .select("id, lot_id, quantity")
    .eq("movement_id", o.movement_id);
  if (cErr) throw cErr;
  for (const c of consumptions ?? []) {
    const { data: lot, error: gErr } = await sb
      .from("inventory_lots")
      .select("qty_remaining")
      .eq("id", c.lot_id)
      .single();
    if (gErr) throw gErr;
    const { error: uErr } = await sb
      .from("inventory_lots")
      .update({ qty_remaining: Number(lot.qty_remaining) + Number(c.quantity) })
      .eq("id", c.lot_id);
    if (uErr) throw uErr;
  }
  // Borra los consumos (lot_id es on delete restrict; deben irse antes del movimiento).
  const { error: dcErr } = await sb.from("inventory_lot_consumptions").delete().eq("movement_id", o.movement_id);
  if (dcErr) throw dcErr;

  // 3. Repone el stock del almacén origen (el trigger no revierte en baja).
  const byProduct = new Map<string, number>();
  for (const l of o.lines) byProduct.set(l.product_id, (byProduct.get(l.product_id) ?? 0) + l.quantity);
  for (const [productId, qty] of byProduct) {
    const { data: stock, error: sErr } = await sb
      .from("stock_locations")
      .select("quantity")
      .eq("product_id", productId)
      .eq("warehouse_id", o.warehouse_id)
      .maybeSingle();
    if (sErr) throw sErr;
    const current = Number(stock?.quantity ?? 0);
    const { error: upErr } = await sb
      .from("stock_locations")
      .update({ quantity: current + qty })
      .eq("product_id", productId)
      .eq("warehouse_id", o.warehouse_id);
    if (upErr) throw upErr;
  }

  // 4. Borra el movimiento de salida (cascade borra sus líneas).
  const { error: dmErr } = await sb.from("inventory_movements").delete().eq("id", o.movement_id);
  if (dmErr) throw dmErr;

  // 5. Devuelve la orden a borrador, limpiando lo congelado al confirmar.
  const { error: poErr } = await sb
    .from("orders")
    .update({
      status: "borrador",
      confirmed_by: null,
      confirmed_at: null,
      movement_id: null,
      cogs_total: 0,
      cogs_usd: 0,
      sale_rate: null,
      amount_usd: null,
    })
    .eq("id", id);
  if (poErr) throw poErr;

  bust();
  revalidateTag("costing", "max");
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  borrador: "Borrador",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, string> = {
  borrador: "bg-muted text-muted-foreground",
  confirmada: "bg-success/10 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};

export const ORDER_ORIGIN_LABEL: Record<OrderOrigin, string> = {
  online: "Online",
  pos: "Tienda (POS)",
  whatsapp: "WhatsApp",
  otro: "Otro",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mixto: "Mixto",
  otro: "Otro",
};

export const ORDER_CURRENCY_LABEL: Record<OrderCurrency, string> = {
  CUP: "CUP",
  USD: "USD",
};
