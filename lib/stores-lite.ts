import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

export type StoreLite = { slug: string; label: string };

export const listStoresLite = unstable_cache(
  async (): Promise<StoreLite[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("stores")
      .select("slug,label")
      .eq("active", true)
      .order("position");
    if (error) throw error;
    return data ?? [];
  },
  ["stores_lite"],
  { revalidate: 300, tags: ["stores"] },
);
