import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

export type ProductLite = {
  id: string;
  name: string;
  store: string | null;
  category: string | null;
  price: number;
  price_cup: number | null;
};

export const listProductsLite = unstable_cache(
  async (scope?: string[]): Promise<ProductLite[]> => {
    const sb = getSupabase();
    let q = sb
      .from("products")
      .select("id,name,store,category,price,product_prices(currency,price)")
      .order("name", { ascending: true });
    // Los productos sin tienda (solo almacén) son visibles para cualquier scope.
    if (scope) q = q.or(`store.in.(${scope.join(",")}),store.is.null`);
    const { data, error } = await q;
    if (error) throw error;
    type R = { id: string; name: string; store: string | null; category: string | null; price: number; product_prices: { currency: string; price: number }[] | null };
    return ((data ?? []) as unknown as R[]).map((p) => {
      const cup = (p.product_prices ?? []).find((x) => x.currency === "CUP");
      return {
        id: p.id,
        name: p.name,
        store: p.store,
        category: p.category,
        price: Number(p.price),
        price_cup: cup != null ? Number(cup.price) : null,
      };
    });
  },
  ["products_lite"],
  { revalidate: 60, tags: ["products"] },
);
