import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import type { Database } from "./supabase-types";

export type Customer = Database["public"]["Tables"]["customers"]["Row"];

const TAG = "customers";
function bust() { revalidateTag(TAG, "max"); }

export const listCustomers = unstable_cache(
  async (): Promise<Customer[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("customers")
      .select("*")
      .order("active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["customers_all"],
  { revalidate: 60, tags: [TAG] },
);

export const getCustomer = unstable_cache(
  async (id: string): Promise<Customer | null> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("customers").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },
  ["customer_by_id"],
  { revalidate: 60, tags: [TAG] },
);

export async function createCustomer(input: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}): Promise<Customer> {
  const sb = getSupabase();
  const { data, error } = await sb.from("customers").insert(input).select().single();
  if (error) throw error;
  bust();
  return data;
}

export async function updateCustomer(
  id: string,
  patch: Partial<{ name: string; phone: string; email: string; address: string; notes: string; active: boolean }>,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("customers").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteCustomer(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("customers").delete().eq("id", id);
  if (error) throw error;
  bust();
}
