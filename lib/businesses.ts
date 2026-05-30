import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";

// Catálogo de "negocios" como dimensión contable: las tiendas + remesas.
// Espejo de lib/stores-lite.ts pero incluye negocios que no son tienda.

export type BusinessLite = { slug: string; label: string; kind: string };

export const listBusinessesLite = unstable_cache(
  async (): Promise<BusinessLite[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("businesses")
      .select("slug,label,kind")
      .eq("active", true)
      .order("position");
    if (error) throw error;
    return data ?? [];
  },
  ["businesses_lite"],
  { revalidate: 300, tags: ["businesses"] },
);
