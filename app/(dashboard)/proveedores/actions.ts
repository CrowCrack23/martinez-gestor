"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupplier, deleteSupplier, updateSupplier } from "@/lib/suppliers";
import { optionalString, requireString } from "@/lib/validation";

function parseInput(form: FormData) {
  return {
    name: requireString(form, "name", "Nombre"),
    contact_name: optionalString(form, "contact_name"),
    phone: optionalString(form, "phone"),
    email: optionalString(form, "email").toLowerCase(),
    tax_id: optionalString(form, "tax_id"),
    address: optionalString(form, "address"),
    notes: optionalString(form, "notes"),
  };
}

export async function createSupplierAction(formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await createSupplier(parseInput(formData));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/proveedores/nuevo?error=${encodeURIComponent(msg)}`);
  }
  redirect("/proveedores?success=Proveedor+creado");
}

export async function updateSupplierAction(id: string, formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await updateSupplier(id, { ...parseInput(formData), active: formData.get("active") === "on" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/proveedores/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect("/proveedores?success=Proveedor+actualizado");
}

export async function deleteSupplierAction(id: string) {
  await requireRole(["admin"]);
  try {
    await deleteSupplier(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/proveedores?error=${encodeURIComponent(msg)}`);
  }
  redirect("/proveedores?success=Proveedor+eliminado");
}
