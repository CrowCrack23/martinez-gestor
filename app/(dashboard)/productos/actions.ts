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
  return Math.round(n * 100) / 100;
}

function parseInput(form: FormData): ProductInput {
  const price = parsePrice(form, "price", "Precio", true)!;
  const oldPrice = parsePrice(form, "old_price", "Precio anterior", false);
  return {
    name: requireString(form, "name", "Nombre"),
    description: optionalString(form, "description"),
    price,
    old_price: oldPrice,
    image: optionalString(form, "image"),
    category: requireString(form, "category", "Categoría"),
    store: requireString(form, "store", "Tienda"),
    shipping_time: optionalString(form, "shipping_time") || null,
    featured: form.get("featured") === "1",
    is_new: form.get("is_new") === "1",
    online_visible: form.get("online_visible") === "1",
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
  await requireRole(["admin", "almacenero"]);
  try {
    await deleteCatalogProduct(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo eliminar (¿tiene ventas o stock asociado?).";
    redirect(`/productos/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/productos?success=Producto+eliminado`);
}
