"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { deactivatePointOfSaleStaff, upsertPointOfSaleStaff } from "@/lib/points-of-sale";
import { requireString, ValidationError } from "@/lib/validation";

export async function upsertPointOfSaleStaffAction(formData: FormData) {
  await requireRole(["admin"]);
  try {
    const pct = Number(formData.get("commission_pct") ?? 0);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new ValidationError("El % de comisión debe estar entre 0 y 100.");
    }
    await upsertPointOfSaleStaff({
      warehouse_id: requireString(formData, "warehouse_id", "Punto de venta"),
      user_id: requireString(formData, "user_id", "Trabajador"),
      commission_pct: pct,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/puntos-venta?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect("/puntos-venta?success=Trabajador+asignado+al+punto");
}

export async function deactivatePointOfSaleStaffAction(warehouseId: string) {
  await requireRole(["admin"]);
  try {
    await deactivatePointOfSaleStaff(warehouseId);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/puntos-venta?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect("/puntos-venta?success=Asignaci%C3%B3n+desactivada");
}
