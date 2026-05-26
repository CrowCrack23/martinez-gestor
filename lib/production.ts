import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createMovement } from "./inventory";
import type { Database, ProductionStatus } from "./supabase-types";

const TAG = "production";
function bust() {
  revalidateTag(TAG, "max");
  revalidateTag("inventory", "max");
}

// ── BOMs ──────────────────────────────────────────────────────────────────

export type Bom = Database["public"]["Tables"]["bills_of_materials"]["Row"];
export type BomComponent = Database["public"]["Tables"]["bom_components"]["Row"];

export type BomWithProduct = Bom & { product_name: string };
export type BomDetail = BomWithProduct & {
  components: (BomComponent & { component_name: string })[];
};

export const listBoms = unstable_cache(
  async (): Promise<BomWithProduct[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("bills_of_materials")
      .select("*, products!inner(name)")
      .order("active", { ascending: false }).order("name");
    if (error) throw error;
    type R = Bom & { products: { name: string } | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({ ...r, product_name: r.products?.name ?? "" }));
  },
  ["boms_all"], { revalidate: 120, tags: [TAG] },
);

export async function getBom(id: string): Promise<BomDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("bills_of_materials")
    .select("*, products!inner(name)").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as unknown as Bom & { products: { name: string } | null };
  const { data: comps, error: cErr } = await sb.from("bom_components")
    .select("*, products!inner(name)").eq("bom_id", id).order("position");
  if (cErr) throw cErr;
  type CR = BomComponent & { products: { name: string } | null };
  const components = ((comps ?? []) as unknown as CR[]).map((c) => ({ ...c, component_name: c.products?.name ?? "" }));
  return { ...d, product_name: d.products?.name ?? "", components };
}

export async function createBom(input: {
  product_id: string; name: string; yield: number; notes: string;
  components: { component_product_id: string; quantity_per_unit: number }[];
}): Promise<string> {
  if (input.components.length === 0) throw new Error("La receta debe tener al menos un insumo.");
  const sb = getSupabase();
  const { data, error } = await sb.from("bills_of_materials")
    .insert({ product_id: input.product_id, name: input.name, yield: input.yield, notes: input.notes })
    .select("id").single();
  if (error) throw error;
  const payload = input.components.map((c, i) => ({
    bom_id: data.id, component_product_id: c.component_product_id, quantity_per_unit: c.quantity_per_unit, position: i,
  }));
  const { error: cErr } = await sb.from("bom_components").insert(payload);
  if (cErr) { await sb.from("bills_of_materials").delete().eq("id", data.id); throw cErr; }
  bust();
  return data.id;
}

export async function updateBom(id: string, patch: {
  product_id?: string; name?: string; yield?: number; notes?: string; active?: boolean;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("bills_of_materials").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function replaceBomComponents(id: string, components: { component_product_id: string; quantity_per_unit: number }[]): Promise<void> {
  if (components.length === 0) throw new Error("La receta debe tener al menos un insumo.");
  const sb = getSupabase();
  const { error: dErr } = await sb.from("bom_components").delete().eq("bom_id", id);
  if (dErr) throw dErr;
  const payload = components.map((c, i) => ({
    bom_id: id, component_product_id: c.component_product_id, quantity_per_unit: c.quantity_per_unit, position: i,
  }));
  const { error } = await sb.from("bom_components").insert(payload);
  if (error) throw error;
  bust();
}

export async function deleteBom(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("bills_of_materials").delete().eq("id", id);
  if (error) throw error;
  bust();
}

// ── Production orders ─────────────────────────────────────────────────────

export type ProductionOrder = Database["public"]["Tables"]["production_orders"]["Row"];
export type ProductionOrderWithRefs = ProductionOrder & {
  bom_name: string; finished_product_id: string; finished_product_name: string;
  warehouse_name: string;
};

export const listProductionOrders = unstable_cache(
  async (): Promise<ProductionOrderWithRefs[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("production_orders")
      .select("*, bills_of_materials!inner(name, product_id, products!inner(name)), warehouses!inner(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    type R = ProductionOrder & {
      bills_of_materials: { name: string; product_id: string; products: { name: string } | null } | null;
      warehouses: { name: string } | null;
    };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      bom_name: r.bills_of_materials?.name ?? "",
      finished_product_id: r.bills_of_materials?.product_id ?? "",
      finished_product_name: r.bills_of_materials?.products?.name ?? "",
      warehouse_name: r.warehouses?.name ?? "",
    }));
  },
  ["production_orders_all"], { revalidate: 30, tags: [TAG] },
);

export async function getProductionOrder(id: string): Promise<ProductionOrderWithRefs | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("production_orders")
    .select("*, bills_of_materials!inner(name, product_id, products!inner(name)), warehouses!inner(name)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as ProductionOrder & {
    bills_of_materials: { name: string; product_id: string; products: { name: string } | null } | null;
    warehouses: { name: string } | null;
  };
  return {
    ...r,
    bom_name: r.bills_of_materials?.name ?? "",
    finished_product_id: r.bills_of_materials?.product_id ?? "",
    finished_product_name: r.bills_of_materials?.products?.name ?? "",
    warehouse_name: r.warehouses?.name ?? "",
  };
}

export async function createProductionOrder(input: {
  bom_id: string; warehouse_id: string; quantity: number; notes: string; created_by: string | null;
}): Promise<string> {
  if (input.quantity <= 0) throw new Error("La cantidad debe ser mayor a 0.");
  const sb = getSupabase();
  const { data, error } = await sb.from("production_orders").insert(input).select("id").single();
  if (error) throw error;
  bust();
  return data.id;
}

export async function produceOrder(id: string, userId: string): Promise<void> {
  const sb = getSupabase();
  const po = await getProductionOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "borrador") throw new Error(`No se puede producir una orden en estado ${po.status}.`);

  const bom = await getBom(po.bom_id);
  if (!bom) throw new Error("Receta no encontrada.");
  if (bom.components.length === 0) throw new Error("La receta no tiene insumos.");

  const builds = Number(po.quantity);

  // Salida de insumos
  const outLines = bom.components.map((c) => ({
    product_id: c.component_product_id,
    quantity: Math.ceil(Number(c.quantity_per_unit) * builds),
  }));
  const movOut = await createMovement({
    type: "salida",
    warehouse_from: po.warehouse_id,
    warehouse_to: null,
    reference_type: "produccion",
    reference_id: po.id,
    user_id: userId,
    notes: `Consumo insumos producción ${po.code}`,
    lines: outLines,
  });

  // Entrada de producto terminado
  const producedQty = Math.floor(Number(bom.yield) * builds);
  if (producedQty <= 0) {
    await sb.from("inventory_movements").delete().eq("id", movOut);
    throw new Error("La cantidad producida resulta en 0 unidades.");
  }
  const movIn = await createMovement({
    type: "entrada",
    warehouse_from: null,
    warehouse_to: po.warehouse_id,
    reference_type: "produccion",
    reference_id: po.id,
    user_id: userId,
    notes: `Producción ${po.code} — ${bom.name}`,
    lines: [{ product_id: bom.product_id, quantity: producedQty }],
  });

  const { error } = await sb.from("production_orders").update({
    status: "producida",
    produced_by: userId,
    produced_at: new Date().toISOString(),
    movement_in_id: movIn,
    movement_out_id: movOut,
  }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function cancelProductionOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const po = await getProductionOrder(id);
  if (!po) throw new Error("Orden no encontrada.");
  if (po.status !== "borrador") throw new Error("Solo se pueden cancelar órdenes en borrador.");
  const { error } = await sb.from("production_orders").update({ status: "cancelada" }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteProductionOrder(id: string): Promise<void> {
  const sb = getSupabase();
  const po = await getProductionOrder(id);
  if (!po) return;
  if (po.status === "producida") throw new Error("No se puede eliminar una orden producida (afecta inventario).");
  const { error } = await sb.from("production_orders").delete().eq("id", id);
  if (error) throw error;
  bust();
}

export const PRODUCTION_STATUS_LABEL: Record<ProductionStatus, string> = {
  borrador: "Borrador",
  producida: "Producida",
  cancelada: "Cancelada",
};

export const PRODUCTION_STATUS_BADGE: Record<ProductionStatus, string> = {
  borrador: "bg-muted text-muted-foreground",
  producida: "bg-success/10 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};
