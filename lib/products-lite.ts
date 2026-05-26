import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

export type ProductLite = {
  id: string;
  name: string;
  store: string;
  category: string;
  price: number;
};

export const listProductsLite = unstable_cache(
  async (): Promise<ProductLite[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("products")
      .select("id,name,store,category,price")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      store: p.store,
      category: p.category,
      price: Number(p.price),
    }));
  },
  ["products_lite"],
  { revalidate: 60, tags: ["products"] },
);
