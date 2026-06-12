"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  createCatalogProduct,
  updateCatalogProduct,
  deleteCatalogProduct,
  type ProductInput,
} from "@/lib/products";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parsePrice(form: FormData, key: string, label: string, required: boolean): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") {
    if (required) throw new ValidationError(`${label} es obligatorio.`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label} inválido.`);
  return Math.round(n * 1e6) / 1e6; // precios: hasta 6 decimales (sin redondeo a centavos)
}

function parseInput(form: FormData): ProductInput {
  // USD funcional: el precio se define SOLO en USD; el CUP se calcula con la
  // tasa del día al vender (no se guarda).
  const price = parsePrice(form, "price", "Precio", true)!;
  const priceEur = parsePrice(form, "price_eur", "Precio EUR", false);
  const oldPrice = parsePrice(form, "old_price", "Precio anterior", false);
  // Tienda opcional: sin tienda = producto "solo almacén" (no se vende online).
  const store = optionalString(form, "store") || null;
  const category = optionalString(form, "category") || null;
  if (store != null && category == null) throw new ValidationError("Categoría es obligatoria cuando el producto pertenece a una tienda.");
  return {
    name: requireString(form, "name", "Nombre"),
    description: optionalString(form, "description"),
    price,
    price_eur: priceEur,
    old_price: oldPrice,
    image: optionalString(form, "image"),
    category,
    store,
    shipping_time: optionalString(form, "shipping_time") || null,
    featured: form.get("featured") === "1",
    is_new: form.get("is_new") === "1",
    online_visible: store != null && form.get("online_visible") === "1",
  };
}

export async function createProductAction(formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  let id: string;
  try {
    id = await createCatalogProduct(parseInput(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/productos/nuevo?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/productos/${id}?success=Producto+creado`);
}

export async function updateProductAction(id: string, formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await updateCatalogProduct(id, parseInput(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/productos/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/productos/${id}?success=Producto+actualizado`);
}

export async function deleteProductAction(id: string) {
  // Borrar es exclusivo del dueño (requisito del cliente).
  await requireRole(["admin"]);
  try {
    await deleteCatalogProduct(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo eliminar (¿tiene ventas o stock asociado?).";
    redirect(`/productos/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/productos?success=Producto+eliminado`);
}
