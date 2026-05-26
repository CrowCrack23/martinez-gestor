"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createCustomer, deleteCustomer, updateCustomer } from "@/lib/customers";
import { optionalString, requireString } from "@/lib/validation";

function parseInput(form: FormData) {
  return {
    name: requireString(form, "name", "Nombre"),
    phone: optionalString(form, "phone"),
    email: optionalString(form, "email").toLowerCase(),
    address: optionalString(form, "address"),
    notes: optionalString(form, "notes"),
  };
}

export async function createCustomerAction(formData: FormData) {
  await requireRole(["admin", "vendedor"]);
  try { await createCustomer(parseInput(formData)); }
  catch (e) { redirect(`/clientes/nuevo?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect("/clientes?success=Cliente+creado");
}

export async function updateCustomerAction(id: string, formData: FormData) {
  await requireRole(["admin", "vendedor"]);
  try { await updateCustomer(id, { ...parseInput(formData), active: formData.get("active") === "on" }); }
  catch (e) { redirect(`/clientes/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect("/clientes?success=Cliente+actualizado");
}

export async function deleteCustomerAction(id: string) {
  await requireRole(["admin"]);
  try { await deleteCustomer(id); }
  catch (e) { redirect(`/clientes?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect("/clientes?success=Cliente+eliminado");
}
