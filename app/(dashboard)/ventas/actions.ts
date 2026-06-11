"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cancelOrder, confirmOrder, createOrder, deleteOrder,
  replaceOrderLines, undoConfirmOrder, updateOrderHeader, type OrderLineInput,
} from "@/lib/sales";
import type { OrderCurrency, OrderOrigin, PaymentMethod } from "@/lib/supabase-types";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

const ORIGINS: OrderOrigin[] = ["online", "pos", "whatsapp", "otro"];
const METHODS: PaymentMethod[] = ["efectivo", "transferencia", "tarjeta", "mixto", "otro"];
const CURRENCIES: OrderCurrency[] = ["CUP", "USD"];

function parseOrigin(v: FormDataEntryValue | null): OrderOrigin {
  const s = String(v ?? "pos");
  if (!ORIGINS.includes(s as OrderOrigin)) throw new ValidationError("Origen inválido.");
  return s as OrderOrigin;
}
function parseMethod(v: FormDataEntryValue | null): PaymentMethod {
  const s = String(v ?? "efectivo");
  if (!METHODS.includes(s as PaymentMethod)) throw new ValidationError("Método de pago inválido.");
  return s as PaymentMethod;
}
function parseCurrency(v: FormDataEntryValue | null): OrderCurrency {
  const s = String(v ?? "CUP");
  if (!CURRENCIES.includes(s as OrderCurrency)) throw new ValidationError("Moneda inválida.");
  return s as OrderCurrency;
}

function parseLines(form: FormData): OrderLineInput[] {
  const productIds = form.getAll("product_id").map(String);
  const quantities = form.getAll("quantity").map((v) => Number(v));
  const prices = form.getAll("unit_price").map((v) => Number(v));
  if (productIds.length === 0) throw new ValidationError("Agrega al menos una línea.");
  if (productIds.length !== quantities.length || productIds.length !== prices.length) {
    throw new ValidationError("Datos de líneas inconsistentes.");
  }
  const lines: OrderLineInput[] = [];
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i]; const qty = quantities[i]; const price = prices[i];
    if (!pid) continue;
    if (!Number.isInteger(qty) || qty <= 0) throw new ValidationError(`Cantidad inválida en línea ${i + 1}.`);
    if (!Number.isFinite(price) || price < 0) throw new ValidationError(`Precio inválido en línea ${i + 1}.`);
    lines.push({ product_id: pid, quantity: qty, unit_price: price });
  }
  if (lines.length === 0) throw new ValidationError("Agrega al menos una línea válida.");
  return lines;
}

export async function createOrderAction(formData: FormData) {
  const user = await requireRole(["admin", "vendedor"]);
  try {
    const id = await createOrder({
      customer_id: optionalString(formData, "customer_id") || null,
      warehouse_id: requireString(formData, "warehouse_id", "Almacén"),
      origin: parseOrigin(formData.get("origin")),
      payment_method: parseMethod(formData.get("payment_method")),
      currency: parseCurrency(formData.get("currency")),
      reference: optionalString(formData, "reference"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
      lines: parseLines(formData),
    });
    redirect(`/ventas/${id}?success=Orden+creada`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/ventas/nueva?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updateOrderAction(id: string, formData: FormData) {
  await requireRole(["admin", "vendedor"]);
  try {
    await updateOrderHeader(id, {
      customer_id: optionalString(formData, "customer_id") || null,
      warehouse_id: requireString(formData, "warehouse_id", "Almacén"),
      origin: parseOrigin(formData.get("origin")),
      payment_method: parseMethod(formData.get("payment_method")),
      currency: parseCurrency(formData.get("currency")),
      reference: optionalString(formData, "reference"),
      notes: optionalString(formData, "notes"),
    });
    await replaceOrderLines(id, parseLines(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/ventas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/ventas/${id}?success=Orden+actualizada`);
}

export async function confirmOrderAction(id: string) {
  const user = await requireRole(["admin", "vendedor"]);
  try { await confirmOrder(id, user.id); }
  catch (e) { redirect(`/ventas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/ventas/${id}?success=Orden+confirmada+y+stock+descontado`);
}

export async function cancelOrderAction(id: string) {
  await requireRole(["admin", "vendedor"]);
  try { await cancelOrder(id); }
  catch (e) { redirect(`/ventas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/ventas/${id}?success=Orden+cancelada`);
}

export async function undoConfirmOrderAction(id: string) {
  // Anular confirmación es exclusivo del dueño (revierte stock y contabilidad).
  await requireRole(["admin"]);
  try { await undoConfirmOrder(id); }
  catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/ventas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/ventas/${id}?success=Confirmaci%C3%B3n+anulada+(vuelta+a+borrador)`);
}

export async function deleteOrderAction(id: string) {
  // Borrar es exclusivo del dueño (requisito del cliente).
  await requireRole(["admin"]);
  try { await deleteOrder(id); }
  catch (e) { redirect(`/ventas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/ventas?success=Orden+eliminada`);
}
