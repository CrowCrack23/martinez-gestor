"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { addFixedAsset, deleteCashMovement, deleteFixedAsset, recordCashMovement } from "@/lib/capital";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

export async function addFixedAssetAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const amount = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Monto inválido.");
    const currency = String(formData.get("currency") ?? "CUP");
    if (currency !== "CUP" && currency !== "USD") throw new ValidationError("Moneda inválida.");
    await addFixedAsset({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      name: requireString(formData, "name", "Descripción"),
      amount,
      currency,
      acquired_at: requireString(formData, "acquired_at", "Fecha"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/capital?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/capital?business=${business}&success=Inversi%C3%B3n+registrada`);
}

export async function deleteFixedAssetAction(id: string, business: string) {
  await requireRole(["admin"]);
  try {
    await deleteFixedAsset(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/capital?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/capital?business=${business}&success=Inversi%C3%B3n+eliminada`);
}

export async function recordCashMovementAction(formData: FormData) {
  const user = await requireRole(["admin", "contador"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const kind = String(formData.get("kind") ?? "");
    if (kind !== "ingreso" && kind !== "gasto") throw new ValidationError("Tipo inválido.");
    const currency = String(formData.get("currency") ?? "CUP");
    if (currency !== "CUP" && currency !== "USD") throw new ValidationError("Moneda inválida.");
    const amount = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Monto inválido.");
    await recordCashMovement({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      kind,
      amount,
      currency,
      concept: requireString(formData, "concept", "Concepto"),
      date: requireString(formData, "date", "Fecha"),
      created_by: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/capital?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/capital?business=${business}&success=Movimiento+registrado`);
}

export async function deleteCashMovementAction(id: string, business: string) {
  await requireRole(["admin", "contador"]);
  try {
    await deleteCashMovement(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/capital?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/capital?business=${business}&success=Movimiento+eliminado`);
}
