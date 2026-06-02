import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { createLot, consumeFIFO, averageCost, bustCosting } from "./costing";
import type { InventoryMovementType } from "./supabase-types";

const TAG = "inventory";

function bust() {
  revalidateTag(TAG, "max");
  revalidateTag("warehouses", "max");
  bustCosting();
}

export type StockRow = {
  product_id: string;
  product_name: string;
  product_store: string;
  category: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  quantity: number;
  min_stock: number;
  max_stock: number | null;
};

type StockJoinRow = {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  min_stock: number;
  max_stock: number | null;
  products: { name: string; store: string; category: string } | null;
  warehouses: { name: string; code: string } | null;
};

export const listStock = unstable_cache(
  async (filter?: { warehouseId?: string; store?: string; lowOnly?: boolean; scope?: string[] }): Promise<StockRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("stock_locations")
      .select(
        "product_id, warehouse_id, quantity, min_stock, max_stock, products!inner(name, store, category), warehouses!inner(name, code)",
      );
    if (filter?.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
    if (filter?.store) q = q.eq("products.store", filter.store);
    if (filter?.scope) q = q.in("products.store", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    const raw = (data ?? []) as unknown as StockJoinRow[];
    const rows: StockRow[] = raw
      .filter((r) => r.products && r.warehouses)
      .map((r) => ({
        product_id: r.product_id,
        product_name: r.products!.name,
        product_store: r.products!.store,
        category: r.products!.category,
        warehouse_id: r.warehouse_id,
        warehouse_name: r.warehouses!.name,
        warehouse_code: r.warehouses!.code,
        quantity: r.quantity,
        min_stock: r.min_stock,
        max_stock: r.max_stock,
      }));
    const filtered = filter?.lowOnly ? rows.filter((r) => r.quantity <= r.min_stock) : rows;
    filtered.sort((a, b) => a.product_name.localeCompare(b.product_name));
    return filtered;
  },
  ["stock_listing"],
  { revalidate: 30, tags: [TAG, "warehouses"] },
);

export async function updateStockBounds(
  productId: string,
  warehouseId: string,
  patch: { min_stock?: number; max_stock?: number | null },
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("stock_locations")
    .update(patch)
    .eq("product_id", productId)
    .eq("warehouse_id", warehouseId);
  if (error) throw error;
  bust();
}

// ── Movements ──────────────────────────────────────────────────────────────

export type MovementLine = { product_id: string; quantity: number; unit_cost?: number | null };

export async function createMovement(input: {
  type: InventoryMovementType;
  warehouse_from: string | null;
  warehouse_to: string | null;
  reference_type?: string;
  reference_id?: string | null;
  user_id?: string | null;
  notes?: string;
  lines: MovementLine[];
}): Promise<string> {
  if (input.lines.length === 0) throw new Error("El movimiento debe tener al menos una línea.");
  const sb = getSupabase();
  const { data: mov, error } = await sb
    .from("inventory_movements")
    .insert({
      type: input.type,
      warehouse_from: input.warehouse_from,
      warehouse_to: input.warehouse_to,
      reference_type: input.reference_type ?? "manual",
      reference_id: input.reference_id ?? null,
      user_id: input.user_id ?? null,
      notes: input.notes ?? "",
    })
    .select("id")
    .single();
  if (error) throw error;

  const linesPayload = input.lines.map((l) => ({
    movement_id: mov.id,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_cost: l.unit_cost ?? null,
  }));
  const { error: lErr } = await sb.from("inventory_movement_lines").insert(linesPayload);
  if (lErr) {
    await sb.from("inventory_movements").delete().eq("id", mov.id);
    throw lErr;
  }

  // Costeo por lotes. El trigger de BD ya aplicó las cantidades a stock_locations;
  // aquí mantenemos el ledger de lotes en sincronía y registramos el costo real
  // de las salidas (FIFO). source_type del lote = reference_type del movimiento.
  const source = input.reference_type ?? "manual";
  for (const l of input.lines) {
    if (input.type === "entrada") {
      await createLot({
        product_id: l.product_id,
        warehouse_id: input.warehouse_to!,
        unit_cost: l.unit_cost ?? 0,
        quantity: l.quantity,
        source_type: source,
        source_id: input.reference_id ?? null,
        movement_id: mov.id,
      });
    } else if (input.type === "salida" || input.type === "merma") {
      await consumeFIFO({
        product_id: l.product_id,
        warehouse_id: input.warehouse_from!,
        quantity: l.quantity,
        movement_id: mov.id,
      });
    } else if (input.type === "transferencia") {
      // Consumir del origen al costo FIFO y recrear el lote en destino al mismo
      // costo promedio, para no perder la valuación al mover stock.
      const { cost } = await consumeFIFO({
        product_id: l.product_id,
        warehouse_id: input.warehouse_from!,
        quantity: l.quantity,
        movement_id: mov.id,
      });
      await createLot({
        product_id: l.product_id,
        warehouse_id: input.warehouse_to!,
        unit_cost: l.quantity > 0 ? cost / l.quantity : 0,
        quantity: l.quantity,
        source_type: "transferencia",
        source_id: input.reference_id ?? null,
        movement_id: mov.id,
      });
    } else if (input.type === "ajuste") {
      // La línea trae el delta con signo: positivo crea lote, negativo consume.
      if (l.quantity > 0) {
        const cost = l.unit_cost ?? (await averageCost(l.product_id, input.warehouse_to!));
        await createLot({
          product_id: l.product_id,
          warehouse_id: input.warehouse_to!,
          unit_cost: cost,
          quantity: l.quantity,
          source_type: "ajuste",
          source_id: input.reference_id ?? null,
          movement_id: mov.id,
        });
      } else if (l.quantity < 0) {
        await consumeFIFO({
          product_id: l.product_id,
          warehouse_id: input.warehouse_to!,
          quantity: -l.quantity,
          movement_id: mov.id,
        });
      }
    }
  }

  bust();
  return mov.id;
}

export type MovementSummary = {
  id: string;
  type: InventoryMovementType;
  warehouse_from_name: string | null;
  warehouse_to_name: string | null;
  user_name: string | null;
  notes: string;
  total_quantity: number;
  line_count: number;
  created_at: string;
};

type MovementRawRow = {
  id: string;
  type: InventoryMovementType;
  notes: string;
  created_at: string;
  warehouse_from: string | null;
  warehouse_to: string | null;
  user_id: string | null;
  inventory_movement_lines: { quantity: number }[] | null;
};

export const listMovements = unstable_cache(
  async (limit = 100): Promise<MovementSummary[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("inventory_movements")
      .select(
        "id, type, notes, created_at, warehouse_from, warehouse_to, user_id, inventory_movement_lines(quantity)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const rows = (data ?? []) as unknown as MovementRawRow[];

    const wIds = new Set<string>();
    const uIds = new Set<string>();
    for (const m of rows) {
      if (m.warehouse_from) wIds.add(m.warehouse_from);
      if (m.warehouse_to) wIds.add(m.warehouse_to);
      if (m.user_id) uIds.add(m.user_id);
    }
    const [wRes, uRes] = await Promise.all([
      wIds.size > 0
        ? sb.from("warehouses").select("id,name").in("id", Array.from(wIds))
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      uIds.size > 0
        ? sb.from("app_users").select("id,full_name,username").in("id", Array.from(uIds))
        : Promise.resolve({ data: [] as { id: string; full_name: string; username: string }[], error: null }),
    ]);
    const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));
    const uMap = new Map((uRes.data ?? []).map((u) => [u.id, u.full_name || u.username]));

    return rows.map((m) => {
      const lines = m.inventory_movement_lines ?? [];
      return {
        id: m.id,
        type: m.type,
        warehouse_from_name: m.warehouse_from ? wMap.get(m.warehouse_from) ?? null : null,
        warehouse_to_name: m.warehouse_to ? wMap.get(m.warehouse_to) ?? null : null,
        user_name: m.user_id ? uMap.get(m.user_id) ?? null : null,
        notes: m.notes,
        total_quantity: lines.reduce((s, l) => s + Math.abs(l.quantity), 0),
        line_count: lines.length,
        created_at: m.created_at,
      };
    });
  },
  ["inventory_movements_recent"],
  { revalidate: 15, tags: [TAG] },
);

export const MOVEMENT_TYPE_LABEL: Record<InventoryMovementType, string> = {
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
  merma: "Merma",
};
