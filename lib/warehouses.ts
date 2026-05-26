import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";

function bust() {
  // Next 16 requires a profile argument on revalidateTag. Use 'max' for
  // stale-while-revalidate behaviour (next request can serve stale, fresh in bg).
  revalidateTag(TAG, "max");
}
import { getSupabase } from "./supabase";
import type { Database, WarehouseType } from "./supabase-types";

export type Warehouse = Database["public"]["Tables"]["warehouses"]["Row"];

const TAG = "warehouses";

export const listWarehouses = unstable_cache(
  async (): Promise<Warehouse[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("warehouses")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["warehouses_all"],
  { revalidate: 60, tags: [TAG] },
);

export const getWarehouse = unstable_cache(
  async (id: string): Promise<Warehouse | null> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("warehouses").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  ["warehouse_by_id"],
  { revalidate: 60, tags: [TAG] },
);

export async function createWarehouse(input: {
  code: string;
  name: string;
  type: WarehouseType;
  store_slug: string | null;
  address: string;
}): Promise<Warehouse> {
  const sb = getSupabase();
  const { data, error } = await sb.from("warehouses").insert(input).select().single();
  if (error) throw error;
  bust();
  return data;
}

export async function updateWarehouse(
  id: string,
  patch: Partial<{
    code: string;
    name: string;
    type: WarehouseType;
    store_slug: string | null;
    address: string;
    active: boolean;
  }>,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("warehouses").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteWarehouse(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("warehouses").delete().eq("id", id);
  if (error) throw error;
  bust();
}

export const WAREHOUSE_TYPE_LABEL: Record<WarehouseType, string> = {
  almacen_central: "Almacén central",
  tienda_fisica: "Tienda física",
  tienda_online: "Tienda online",
  centro_elaboracion: "Centro de elaboración",
};
