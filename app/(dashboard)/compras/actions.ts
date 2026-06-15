"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrder,
  replacePurchaseOrderLines,
  undoReceivePurchaseOrder,
  updatePurchaseOrderHeader,
  type PurchaseLineInput,
} from "@/lib/purchases";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parseOptionalPrice(raw: string, label: string, line: number): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`${label} inválido en línea ${line}.`);
  return Math.round(n * 1e6) / 1e6; // precios/costos unitarios: hasta 6 decimales
}

function parseLines(form: FormData): PurchaseLineInput[] {
  const modes = form.getAll("line_mode").map(String);
  const productIds = form.getAll("product_id").map(String);
  const newNames = form.getAll("new_name").map(String);
  const newPricesUsd = form.getAll("new_price_usd").map(String);
  const quantities = form.getAll("quantity").map((v) => Number(v));
  // USD funcional: el costo de compra se captura en dólares.
  const costs = form.getAll("unit_cost_usd").map((v) => Number(v));
  if (productIds.length === 0) throw new ValidationError("Agrega al menos una línea.");
  if (productIds.length !== quantities.length || productIds.length !== costs.length) {
    throw new ValidationError("Datos de líneas inconsistentes.");
  }
  const lines: PurchaseLineInput[] = [];
  for (let i = 0; i < productIds.length; i++) {
    // line_mode/new_* solo existen en el editor nuevo; formularios viejos no los envían.
    const isNew = modes[i] === "nuevo";
    const pid = productIds[i];
    const name = (newNames[i] ?? "").trim();
    const qty = quantities[i];
    const cost = costs[i];
    if (!isNew && !pid) continue;
    if (isNew && !name) throw new ValidationError(`Escribe el nombre del producto nuevo en línea ${i + 1}.`);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new ValidationError(`Cantidad inválida en línea ${i + 1} (debe ser mayor a 0).`);
    }
    if (!Number.isFinite(cost) || cost < 0) {
      throw new ValidationError(`Costo USD inválido en línea ${i + 1}.`);
    }
    lines.push({
      product_id: isNew ? "" : pid,
      quantity: qty,
      unit_cost_usd: cost,
      ...(isNew
        ? {
            new_product: {
              name,
              price_usd: parseOptionalPrice(newPricesUsd[i] ?? "", "Precio USD", i + 1),
            },
          }
        : null),
    });
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
      paid_cash: formData.get("payment") === "contado",
      payment_currency: formData.get("payment_currency") === "CUP" ? "CUP" : "USD",
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
      paid_cash: formData.get("payment") === "contado",
      payment_currency: formData.get("payment_currency") === "CUP" ? "CUP" : "USD",
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

export async function undoReceivePurchaseOrderAction(id: string) {
  // Anular recepción es exclusivo del dueño (revierte stock y contabilidad).
  await requireRole(["admin"]);
  try {
    await undoReceivePurchaseOrder(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras/${id}?success=Recepci%C3%B3n+anulada+(vuelta+a+borrador)`);
}

export async function deletePurchaseOrderAction(id: string) {
  // Borrar es exclusivo del dueño (requisito del cliente).
  await requireRole(["admin"]);
  try {
    await deletePurchaseOrder(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/compras/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/compras?success=Orden+eliminada`);
}
