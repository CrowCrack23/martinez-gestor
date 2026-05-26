"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrder,
  replacePurchaseOrderLines,
  updatePurchaseOrderHeader,
  type PurchaseLineInput,
} from "@/lib/purchases";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parseLines(form: FormData): PurchaseLineInput[] {
  const productIds = form.getAll("product_id").map(String);
  const quantities = form.getAll("quantity").map((v) => Number(v));
  const costs = form.getAll("unit_cost").map((v) => Number(v));
  if (productIds.length === 0) throw new ValidationError("Agrega al menos una línea.");
  if (productIds.length !== quantities.length || productIds.length !== costs.length) {
    throw new ValidationError("Datos de líneas inconsistentes.");
  }
  const lines: PurchaseLineInput[] = [];
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i];
    const qty = quantities[i];
    const cost = costs[i];
    if (!pid) continue;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new ValidationError(`Cantidad inválida en línea ${i + 1} (debe ser un entero > 0).`);
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new ValidationError(`Costo inválido en línea ${i + 1}.`);
    }
    lines.push({ product_id: pid, quantity: qty, unit_cost: cost });
  }
  if (lines.length === 0) throw new ValidationError("Agrega al menos una línea válida.");
  return lines;
}

export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requireRole(["admin", "almacenero"]);
  try {
    const id = await createPurchaseOrder({
      supplier_id: requireString(formData, "supplier_id", "Proveedor"),
      warehouse_id: requireString(formData, "warehouse_id", "Almacén"),
      reference: optionalString(formData, "reference"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
      lines: parseLines(formData),
    });
    redirect(`/compras/${id}?success=Orden+creada`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/nueva?error=${encodeURIComponent(msg)}`);
  }
}

export async function updatePurchaseOrderAction(id: string, formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    await updatePurchaseOrderHeader(id, {
      supplier_id: requireString(formData, "supplier_id", "Proveedor"),
      warehouse_id: requireString(formData, "warehouse_id", "Almacén"),
      reference: optionalString(formData, "reference"),
      notes: optionalString(formData, "notes"),
    });
    await replacePurchaseOrderLines(id, parseLines(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras/${id}?success=Orden+actualizada`);
}

export async function receivePurchaseOrderAction(id: string) {
  const user = await requireRole(["admin", "almacenero"]);
  try {
    await receivePurchaseOrder(id, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras/${id}?success=Orden+recibida+y+stock+actualizado`);
}

export async function cancelPurchaseOrderAction(id: string) {
  await requireRole(["admin", "almacenero"]);
  try {
    await cancelPurchaseOrder(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras/${id}?success=Orden+cancelada`);
}

export async function deletePurchaseOrderAction(id: string) {
  await requireRole(["admin", "almacenero"]);
  try {
    await deletePurchaseOrder(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras?success=Orden+eliminada`);
}
