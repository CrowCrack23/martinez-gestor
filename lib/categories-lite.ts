import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

export type CategoryLite = { name: string; store: string };

// Categorías del catálogo (tabla de martinez-global). El nombre es único global;
// cada categoría pertenece a una tienda (columna store). Se usa para poblar el
// selector dependiente del formulario de producto.
export const listCategoriesLite = unstable_cache(
  async (): Promise<CategoryLite[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("categories")
      .select("name,store")
      .order("position")
      .order("name");
    if (error) throw error;
    return (data ?? []) as CategoryLite[];
  },
  ["categories_lite"],
  { revalidate: 300, tags: ["products"] },
);
