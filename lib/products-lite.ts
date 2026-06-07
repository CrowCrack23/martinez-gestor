import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

// USD funcional: el precio del producto es SOLO el USD (products.price);
// el CUP se calcula al vuelo con la tasa del día (priceCupFromUsd).

export type ProductLite = {
  id: string;
  name: string;
  store: string | null;
  category: string | null;
  price: number;
};

export const listProductsLite = unstable_cache(
  async (scope?: string[]): Promise<ProductLite[]> => {
    const sb = getSupabase();
    let q = sb
      .from("products")
      .select("id,name,store,category,price")
      .order("name", { ascending: true });
    // Los productos sin tienda (solo almacén) son visibles para cualquier scope.
    if (scope) q = q.or(`store.in.(${scope.join(",")}),store.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    type R = { id: string; name: string; store: string | null; category: string | null; price: number };
    return ((data ?? []) as unknown as R[]).map((p) => ({
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
