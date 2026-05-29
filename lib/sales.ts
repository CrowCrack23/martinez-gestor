import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createMovement } from "./inventory";
import { generateSaleEntry } from "./auto-accounting";
import type { OrderOrigin, OrderStatus, PaymentMethod } from "./supabase-types";

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
        "id,code,status,origin,customer_id,warehouse_id,payment_method,reference,total_amount,payment_status,created_at,confirmed_at,customers(name),warehouses!inner(name,store_slug),order_lines(id)",
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
  reference: string;
  notes: string;
  total_amount: number;
  payment_status: string;
  amount_charged: number | null;
  charge_currency: string | null;
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
      "id,code,status,origin,customer_id,warehouse_id,payment_method,reference,notes,total_amount,payment_status,amount_charged,charge_currency,created_at,confirmed_at,movement_id,customers(name),warehouses!inner(name,store_slug)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as unknown as {
    id: string; code: string; status: OrderStatus; origin: OrderOrigin;
    customer_id: string | null; warehouse_id: string; payment_method: PaymentMethod;
    reference: string; notes: string; total_amount: number;
    payment_status: string; amount_charged: number | null; charge_currency: string | null;
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
    reference: d.reference,
    notes: d.notes,
    total_amount: Number(d.total_amount),
    payment_status: d.payment_status ?? "no_aplica",
    amount_charged: d.amount_charged != null ? Number(d.amount_charged) : null,
    charge_currency: d.charge_currency,
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
  reference: string;
  notes: string;
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
      reference: input.reference,
      notes: input.notes,
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
    reference?: string;
    notes?: string;
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

  const movementId = await createMovement({
    type: "salida",
    warehouse_from: o.warehouse_id,
    warehouse_to: null,
    reference_type: "venta",
    reference_id: o.id,
    user_id: userId,
    notes: `Venta ${o.code}${o.reference ? ` — ref. ${o.reference}` : ""}`,
    // Sin unit_cost: el costo real de la salida lo calcula el costeo FIFO por lotes.
    lines: o.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
  });

  const { error } = await sb
    .from("orders")
    .update({
      status: "confirmada",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      movement_id: movementId,
    })
    .eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador): Cobro/CxC / Ventas + Costo de ventas / Inventario.
  await generateSaleEntry({
    orderId: o.id,
    code: o.code,
    customerName: o.customer_name,
    total: o.total_amount,
    paymentMethod: o.payment_method,
    origin: o.origin,
    movementId,
    business: o.warehouse_store,
    date: new Date().toISOString().slice(0, 10),
    userId,
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
  if (o.status === "confirmada") throw new Error("No se puede eliminar una orden confirmada (afecta el inventario).");
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) throw error;
  bust();
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
