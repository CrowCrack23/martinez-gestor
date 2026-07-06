"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createMovement, reverseMovement, type MovementLine } from "@/lib/inventory";
import { getRateForDate } from "@/lib/currency";
import type { InventoryMovementType } from "@/lib/supabase-types";
import { optionalString, requireDate, ValidationError } from "@/lib/validation";

const TYPES: InventoryMovementType[] = ["entrada", "salida", "transferencia", "ajuste", "merma"];

export async function createMovementAction(formData: FormData) {
  const user = await requireRole(["admin", "almacenero"]);
  try {
    const typeRaw = String(formData.get("type") ?? "");
    if (!TYPES.includes(typeRaw as InventoryMovementType)) {
      throw new ValidationError("Tipo de movimiento inválido.");
    }
    const type = typeRaw as InventoryMovementType;

    const warehouseFrom = optionalString(formData, "warehouse_from") || null;
    const warehouseTo = optionalString(formData, "warehouse_to") || null;

    // Validar endpoints según tipo
    if (type === "transferencia") {
      if (!warehouseFrom || !warehouseTo) throw new ValidationError("La transferencia requiere almacén origen y destino.");
      if (warehouseFrom === warehouseTo) throw new ValidationError("El origen y destino no pueden ser el mismo almacén.");
    } else if (type === "entrada") {
      if (!warehouseTo) throw new ValidationError("La entrada requiere almacén destino.");
    } else if (type === "salida" || type === "merma") {
      if (!warehouseFrom) throw new ValidationError("Este movimiento requiere almacén origen.");
    } else if (type === "ajuste") {
      if (!warehouseTo) throw new ValidationError("El ajuste requiere almacén.");
    }

    // Líneas: vienen como product_id[] y quantity[]
    const productIds = formData.getAll("product_id").map(String);
    const quantities = formData.getAll("quantity").map((v) => Number(v));
    if (productIds.length === 0) throw new ValidationError("Agrega al menos una línea.");
    if (productIds.length !== quantities.length) throw new ValidationError("Datos de líneas inconsistentes.");

    const lines: MovementLine[] = [];
    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const qty = quantities[i];
      if (!pid) continue;
      if (!Number.isFinite(qty) || qty === 0) {
        throw new ValidationError(`Cantidad inválida en línea ${i + 1}.`);
      }
      if (type !== "ajuste" && qty < 0) {
        throw new ValidationError(`La cantidad debe ser positiva en línea ${i + 1} (solo "ajuste" permite negativos).`);
      }
      lines.push({ product_id: pid, quantity: qty });
    }
    if (lines.length === 0) throw new ValidationError("Agrega al menos una línea válida.");

    // Tasa vigente en la FECHA del movimiento para congelar el USD de los lotes.
    const operationDate = requireDate(formData, "operation_date", "Fecha");
    const rate = await getRateForDate(operationDate);
    // Gasto de transportación (USD): solo aplica a entradas (se suma al costo).
    const freightRaw = Number(formData.get("freight_usd") ?? 0);
    if (!Number.isFinite(freightRaw) || freightRaw < 0) throw new ValidationError("Gasto de transportación inválido.");
    await createMovement({
      type,
      warehouse_from: warehouseFrom,
      warehouse_to: warehouseTo,
      user_id: user.id,
      notes: optionalString(formData, "notes"),
      rate,
      operation_date: operationDate,
      freight_usd: type === "entrada" ? freightRaw : 0,
      lines,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/inventario/movimientos/nuevo?error=${encodeURIComponent(msg)}`);
  }
  redirect("/inventario/movimientos?success=Movimiento+registrado");
}

export async function reverseMovementAction(id: string) {
  // Revertir un movimiento es exclusivo del dueño (devuelve stock y contabilidad).
  await requireRole(["admin"]);
  try {
    await reverseMovement(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/inventario/movimientos?error=${encodeURIComponent(msg)}`);
  }
  redirect("/inventario/movimientos?success=Movimiento+revertido");
}
