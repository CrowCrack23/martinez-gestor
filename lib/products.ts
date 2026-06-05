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
  /** Precio USD del catálogo online (tabla products, martinez-global). */
  price: number;
  /** Precios del gestor por moneda (tabla product_prices, migración 0036). */
  price_cup: number | null;
  price_eur: number | null;
  old_price: number | null;
  image: string;
  category: string;
  store: string;
  shipping_time: string | null;
  featured: boolean;
  is_new: boolean;
  online_visible: boolean;
};

type PriceRow = { currency: string; price: number };

function pickPrice(prices: PriceRow[] | null | undefined, currency: string): number | null {
  const row = (prices ?? []).find((p) => p.currency === currency);
  return row != null ? Number(row.price) : null;
}

export type ProductListRow = ProductRow & { stock_total: number };

export const listCatalog = unstable_cache(
  async (filter?: { store?: string; scope?: string[] }): Promise<ProductRow[]> => {
    const sb = getSupabase();
    let q = sb
      .from("products")
      .select("id,name,description,price,old_price,image,category,store,shipping_time,featured,is_new,online_visible,product_prices(currency,price)")
      .order("name");
    if (filter?.store) q = q.eq("store", filter.store);
    if (filter?.scope) q = q.in("store", filter.scope);
    const { data, error } = await q;
    if (error) throw error;
    type R = Omit<ProductRow, "price_cup" | "price_eur"> & { product_prices: PriceRow[] | null };
    return ((data ?? []) as unknown as R[]).map(({ product_prices, ...p }) => ({
      ...p,
      price: Number(p.price),
      price_cup: pickPrice(product_prices, "CUP"),
      price_eur: pickPrice(product_prices, "EUR"),
      old_price: p.old_price != null ? Number(p.old_price) : null,
    }));
  },
  ["catalog_list"],
  { revalidate: 60, tags: [TAG] },
);

export async function getCatalogProduct(id: string): Promise<ProductRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("products")
    .select("id,name,description,price,old_price,image,category,store,shipping_time,featured,is_new,online_visible,product_prices(currency,price)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type R = Omit<ProductRow, "price_cup" | "price_eur"> & { product_prices: PriceRow[] | null };
  const { product_prices, ...p } = data as unknown as R;
  return {
    ...p,
    price: Number(p.price),
    price_cup: pickPrice(product_prices, "CUP"),
    price_eur: pickPrice(product_prices, "EUR"),
    old_price: p.old_price != null ? Number(p.old_price) : null,
  };
}

export type ProductInput = {
  name: string;
  description: string;
  price: number;
  price_cup: number | null;
  price_eur: number | null;
  old_price: number | null;
  image: string;
  category: string;
  store: string;
  shipping_time: string | null;
  featured: boolean;
  is_new: boolean;
  online_visible: boolean;
};

/** Sincroniza los precios por moneda del gestor (upsert o borrado si null). */
async function syncProductPrices(productId: string, input: ProductInput): Promise<void> {
  const sb = getSupabase();
  const entries: { currency: "CUP" | "EUR"; price: number | null }[] = [
    { currency: "CUP", price: input.price_cup },
    { currency: "EUR", price: input.price_eur },
  ];
  for (const e of entries) {
    if (e.price != null) {
      const { error } = await sb
        .from("product_prices")
        .upsert({ product_id: productId, currency: e.currency, price: e.price }, { onConflict: "product_id,currency" });
      if (error) throw error;
    } else {
      const { error } = await sb
        .from("product_prices")
        .delete()
        .eq("product_id", productId)
        .eq("currency", e.currency);
      if (error) throw error;
    }
  }
}

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
  await syncProductPrices(id, input);
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
  await syncProductPrices(id, input);
  bust();
}

export async function deleteCatalogProduct(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
  bust();
}
