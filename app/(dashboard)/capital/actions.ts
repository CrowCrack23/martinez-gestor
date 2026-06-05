"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { addFixedAsset } from "@/lib/capital";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

export async function addFixedAssetAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const amount = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Monto inválido.");
    await addFixedAsset({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      name: requireString(formData, "name", "Descripción"),
      amount,
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
