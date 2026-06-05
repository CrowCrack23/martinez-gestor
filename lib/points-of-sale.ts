import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";

// Puntos de venta (migración 0023): un punto de venta ES un warehouse de tipo
// 'punto_venta'; aquí solo se administra su trabajador fijo y el % de comisión
// sobre la ganancia (venta − costo FIFO) de las ventas del punto. El % es
// negociable por trabajador (requisito del cliente), por eso vive en esta
// tabla y no en employees.commission_rate (que es otra base de cálculo).

const TAG = "pos";

function bust() {
  revalidateTag(TAG, "max");
}

export type PointOfSale = {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  store_slug: string | null;
  warehouse_active: boolean;
  user_id: string | null;
  user_name: string | null;
  commission_pct: number;
  staff_active: boolean;
};

type WarehouseRaw = {
  id: string;
  code: string;
  name: string;
  store_slug: string | null;
  active: boolean;
};

/**
 * Lista los warehouses tipo 'punto_venta' con su trabajador asignado (si lo
 * hay). scope limita a las tiendas (negocios) del usuario.
 */
export const listPointsOfSale = unstable_cache(
  async (scope?: string[]): Promise<PointOfSale[]> => {
    const sb = getSupabase();
    let q = sb
      .from("warehouses")
      .select("id,code,name,store_slug,active")
      .eq("type", "punto_venta")
      .order("name");
    if (scope) q = q.in("store_slug", scope);
    const { data: whs, error } = await q;
    if (error) throw error;
    const warehouses = (whs ?? []) as WarehouseRaw[];
    if (warehouses.length === 0) return [];

    const { data: staff, error: sErr } = await sb
      .from("point_of_sale_staff")
      .select("warehouse_id,user_id,commission_pct,active,app_users(full_name,username)")
      .in("warehouse_id", warehouses.map((w) => w.id));
    if (sErr) throw sErr;
    type StaffRaw = {
      warehouse_id: string;
      user_id: string;
      commission_pct: number;
      active: boolean;
      app_users: { full_name: string; username: string } | null;
    };
    const staffMap = new Map(
      ((staff ?? []) as unknown as StaffRaw[]).map((s) => [s.warehouse_id, s]),
    );

    return warehouses.map((w) => {
      const s = staffMap.get(w.id);
      return {
        warehouse_id: w.id,
        warehouse_code: w.code,
        warehouse_name: w.name,
        store_slug: w.store_slug,
        warehouse_active: w.active,
        user_id: s?.user_id ?? null,
        user_name: s ? (s.app_users?.full_name || s.app_users?.username || null) : null,
        commission_pct: s ? Number(s.commission_pct) : 0,
        staff_active: s?.active ?? false,
      };
    });
  },
  ["points_of_sale"],
  { revalidate: 60, tags: [TAG, "warehouses"] },
);

/** Trabajador y % vigentes de un punto (null si no tiene asignación activa). */
export async function getPointOfSaleStaff(
  warehouseId: string,
): Promise<{ user_id: string; commission_pct: number } | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("point_of_sale_staff")
    .select("user_id,commission_pct,active")
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active) return null;
  return { user_id: data.user_id, commission_pct: Number(data.commission_pct) };
}

/** Asigna (o reasigna) el trabajador fijo de un punto y su % de comisión. */
export async function upsertPointOfSaleStaff(input: {
  warehouse_id: string;
  user_id: string;
  commission_pct: number;
  active?: boolean;
}): Promise<void> {
  if (!Number.isFinite(input.commission_pct) || input.commission_pct < 0 || input.commission_pct > 100) {
    throw new Error("El % de comisión debe estar entre 0 y 100.");
  }
  const sb = getSupabase();
  const { error } = await sb.from("point_of_sale_staff").upsert(
    {
      warehouse_id: input.warehouse_id,
      user_id: input.user_id,
      commission_pct: input.commission_pct,
      active: input.active ?? true,
    },
    { onConflict: "warehouse_id" },
  );
  if (error) throw error;
  bust();
}

/** Desactiva la asignación del punto (el warehouse sigue existiendo). */
export async function deactivatePointOfSaleStaff(warehouseId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("point_of_sale_staff")
    .update({ active: false })
    .eq("warehouse_id", warehouseId);
  if (error) throw error;
  bust();
}
