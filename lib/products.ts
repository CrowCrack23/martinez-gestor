import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";

// CRUD del catálogo de productos desde el ERP. La tabla `products` es compartida
// con la tienda martinez-global (misma BD Supabase). El stock real se lleva por
// almacén en stock_locations (módulo de inventario); el campo legacy products.stock
// se mantiene en 0 desde aquí. `online_visible` controla si la tienda lo muestra.

const TAG = "products";
function bust() {
  revalidateTag(TAG, "max");
}

export type ProductRow = {
  id: string;
  name: string;
  description: string;
  price: number;
  old_price: number | null;
  image: string;
  category: string;
  store: string;
  shipping_time: string | null;
  featured: boolean;
  is_new: boolean;
  online_visible: boolean;
};

export type ProductListRow = ProductRow & { stock_total: number };

export const listCatalog = unstable_cache(
  async (filter?: { store?: string; scope?: string[] }): Promise<ProductRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("products")
      .select("id,name,description,price,old_price,image,category,store,shipping_time,featured,is_new,online_visible")
      .order("name");
    if (filter?.store) q = q.eq("store", filter.store);
    if (filter?.scope) q = q.in("store", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((p) => ({ ...p, price: Number(p.price), old_price: p.old_price != null ? Number(p.old_price) : null }));
  },
  ["catalog_list"],
  { revalidate: 60, tags: [TAG] },
);

export async function getCatalogProduct(id: string): Promise<ProductRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("products")
    .select("id,name,description,price,old_price,image,category,store,shipping_time,featured,is_new,online_visible")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, price: Number(data.price), old_price: data.old_price != null ? Number(data.old_price) : null };
}

export type ProductInput = {
  name: string;
  description: string;
  price: number;
  old_price: number | null;
  image: string;
  category: string;
  store: string;
  shipping_time: string | null;
  featured: boolean;
  is_new: boolean;
  online_visible: boolean;
};

export async function createCatalogProduct(input: ProductInput): Promise<string> {
  const sb = getSupabase();
  const id = randomUUID();
  const { error } = await sb.from("products").insert({
    id,
    name: input.name,
    description: input.description,
    price: input.price,
    old_price: input.old_price,
    image: input.image,
    stock: 0,
    category: input.category,
    store: input.store,
    shipping_time: input.shipping_time,
    featured: input.featured,
    is_new: input.is_new,
    online_visible: input.online_visible,
  });
  if (error) throw error;
  bust();
  return id;
}

export async function updateCatalogProduct(id: string, input: ProductInput): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("products")
    .update({
      name: input.name,
      description: input.description,
      price: input.price,
      old_price: input.old_price,
      image: input.image,
      category: input.category,
      store: input.store,
      shipping_time: input.shipping_time,
      featured: input.featured,
      is_new: input.is_new,
      online_visible: input.online_visible,
    })
    .eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteCatalogProduct(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
  bust();
}
