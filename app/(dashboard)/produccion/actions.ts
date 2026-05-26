"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cancelProductionOrder, createProductionOrder, deleteProductionOrder, produceOrder,
} from "@/lib/production";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

export async function createProductionOrderAction(formData: FormData) {
  const user = await requireRole(["admin", "almacenero"]);
  try {
    const qty = Number(formData.get("quantity") ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new ValidationError("Cantidad inválida.");
    const id = await createProductionOrder({
      bom_id: requireString(formData, "bom_id", "Receta"),
      warehouse_id: requireString(formData, "warehouse_id", "Almacén"),
      quantity: qty,
      notes: optionalString(formData, "notes"),
      created_by: user.id,
    });
    redirect(`/produccion/${id}?success=Orden+creada`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/produccion/nueva?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function produceOrderAction(id: string) {
  const user = await requireRole(["admin", "almacenero"]);
  try { await produceOrder(id, user.id); }
  catch (e) { redirect(`/produccion/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/produccion/${id}?success=Producci%C3%B3n+registrada+y+stock+actualizado`);
}

export async function cancelProductionOrderAction(id: string) {
  await requireRole(["admin", "almacenero"]);
  try { await cancelProductionOrder(id); }
  catch (e) { redirect(`/produccion/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/produccion/${id}?success=Orden+cancelada`);
}

export async function deleteProductionOrderAction(id: string) {
  await requireRole(["admin", "almacenero"]);
  try { await deleteProductionOrder(id); }
  catch (e) { redirect(`/produccion/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/produccion?success=Orden+eliminada`);
}
