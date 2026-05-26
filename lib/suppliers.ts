import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import type { Database } from "./supabase-types";

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

const TAG = "suppliers";
function bust() { revalidateTag(TAG, "max"); }

export const listSuppliers = unstable_cache(
  async (): Promise<Supplier[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("suppliers")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["suppliers_all"],
  { revalidate: 60, tags: [TAG] },
);

export const getSupplier = unstable_cache(
  async (id: string): Promise<Supplier | null> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("suppliers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  ["supplier_by_id"],
  { revalidate: 60, tags: [TAG] },
);

export async function createSupplier(input: {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  tax_id?: string;
  address?: string;
  notes?: string;
}): Promise<Supplier> {
  const sb = getSupabase();
  const { data, error } = await sb.from("suppliers").insert(input).select().single();
  if (error) throw error;
  bust();
  return data;
}

export async function updateSupplier(
  id: string,
  patch: Partial<{
    name: string;
    contact_name: string;
    phone: string;
    email: string;
    tax_id: string;
    address: string;
    notes: string;
    active: boolean;
  }>,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("suppliers").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteSupplier(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("suppliers").delete().eq("id", id);
  if (error) throw error;
  bust();
}
