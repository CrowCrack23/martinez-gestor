import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createMovement } from "./inventory";
import type { PurchaseOrderStatus } from "./supabase-types";

const TAG = "purchases";
function bust() {
  revalidateTag(TAG, "max");
  revalidateTag("inventory", "max");
}

export type PurchaseLineInput = { product_id: string; quantity: number; unit_cost: number };

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
  async (filter?: { status?: PurchaseOrderStatus }): Promise<PurchaseOrderSummary[]> => {
    const sb = getSupabase();
    let q = sb
      .from("purchase_orders")
      .select(
        "id,code,status,supplier_id,warehouse_id,reference,total_amount,created_at,received_at,suppliers!inner(name),warehouses!inner(name),purchase_order_lines(id)",
      )
      .order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
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
  reference: string;
  notes: string;
  total_amount: number;
  created_at: string;
  received_at: string | null;
  movement_id: string | null;
  lines: PurchaseLine[];
};

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      "id,code,status,supplier_id,warehouse_id,reference,notes,total_amount,created_at,received_at,movement_id,suppliers!inner(name),warehouses!inner(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: rawLines, error: lErr } = await sb
    .from("purchase_order_lines")
    .select("id,product_id,quantity,unit_cost,line_total,position,products!inner(name)")
    .eq("purchase_order_id", id)
    .order("position");
  if (lErr) throw lErr;

  type LineRaw = {
    id: string;
    product_id: string;
    quantity: number;
    unit_cost: number;
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
    total_amount: number;
    created_at: string;
    received_at: string | null;
    movement_id: string | null;
    suppliers: { name: string } | null;
    warehouses: { name: string } | null;
  };

  return {
    id: d.id,
    code: d.code,
    status: d.status,
    supplier_id: d.supplier_id,
    supplier_name: d.suppliers?.name ?? "",
    warehouse_id: d.warehouse_id,
    warehouse_name: d.warehouses?.name ?? "",
    reference: d.reference,
    notes: d.notes,
    total_amount: Number(d.total_amount),
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
  created_by: string | null;
  lines: PurchaseLineInput[];
}): Promise<string> {
  if (input.lines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  const sb = getSupabase();
  const { data: po, error } = await sb
    .from("purchase_orders")
    .insert({
      supplier_id: input.supplier_id,
      warehouse_id: input.warehouse_id,
      reference: input.reference,
      notes: input.notes,
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error) throw error;

  const payload = input.lines.map((l, i) => ({
    purchase_order_id: po.id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_cost: l.unit_cost,
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

export async function updatePurchaseOrderHeader(
  id: string,
  patch: { supplier_id?: string; warehouse_id?: string; reference?: string; notes?: string },
): Promise<void> {
  const sb = getSupabase();
  // Solo se permite si está en borrador (validado en el server action)
  const { error } = await sb.from("purchase_orders").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function replacePurchaseOrderLines(
  id: string,
  lines: PurchaseLineInput[],
): Promise<void> {
  if (lines.length === 0) throw new Error("La orden debe tener al menos una línea.");
  const sb = getSupabase();
  const { error: dErr } = await sb.from("purchase_order_lines").delete().eq("purchase_order_id", id);
  if (dErr) throw dErr;
  const payload = lines.map((l, i) => ({
    purchase_order_id: id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_cost: l.unit_cost,
    position: i,
  }));
  const { error } = await sb.from("purchase_order_lines").insert(payload);
  if (error) throw error;
  bust();
}

export async function receivePurchaseOrder(id: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const po = await getPurchaseOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "borrador") throw new Error(`No se puede recibir una orden en estado ${po.status}.`);
  if (po.lines.length === 0) throw new Error("La orden no tiene líneas.");

  // Crear el movimiento de entrada
  const movementId = await createMovement({
    type: "entrada",
    warehouse_from: null,
    warehouse_to: po.warehouse_id,
    reference_type: "compra",
    reference_id: po.id,
    user_id: userId,
    notes: `Recepción ${po.code}${po.reference ? ` — fact. ${po.reference}` : ""}`,
    lines: po.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })),
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
  if (po.status === "recibida") throw new Error("No se puede eliminar una orden recibida (afecta el inventario).");
  const { error } = await sb.from("purchase_orders").delete().eq("id", id);
  if (error) throw error;
  bust();
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
