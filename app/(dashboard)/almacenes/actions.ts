"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createWarehouse, deleteWarehouse, updateWarehouse } from "@/lib/warehouses";
import type { WarehouseType } from "@/lib/supabase-types";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

const TYPES: WarehouseType[] = ["almacen_central", "tienda_fisica", "tienda_online", "centro_elaboracion"];

function parseType(form: FormData): WarehouseType {
  const v = String(form.get("type") ?? "");
  if (!TYPES.includes(v as WarehouseType)) throw new ValidationError("Tipo de almacén inválido.");
  return v as WarehouseType;
}

export async function createWarehouseAction(formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await createWarehouse({
      code: requireString(formData, "code", "Código").toUpperCase(),
      name: requireString(formData, "name", "Nombre"),
      type: parseType(formData),
      store_slug: optionalString(formData, "store_slug") || null,
      address: optionalString(formData, "address"),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/almacenes/nuevo?error=${encodeURIComponent(msg)}`);
  }
  redirect("/almacenes?success=Almac%C3%A9n+creado");
}

export async function updateWarehouseAction(id: string, formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await updateWarehouse(id, {
      code: requireString(formData, "code", "Código").toUpperCase(),
      name: requireString(formData, "name", "Nombre"),
      type: parseType(formData),
      store_slug: optionalString(formData, "store_slug") || null,
      address: optionalString(formData, "address"),
      active: formData.get("active") === "on",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/almacenes/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect("/almacenes?success=Almac%C3%A9n+actualizado");
}

export async function deleteWarehouseAction(id: string) {
  await requireRole(["admin"]);
  try {
    await deleteWarehouse(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/almacenes?error=${encodeURIComponent(msg)}`);
  }
  redirect("/almacenes?success=Almac%C3%A9n+eliminado");
}
