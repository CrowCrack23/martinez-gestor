"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { setOpeningLotCost } from "@/lib/costing";

export async function setOpeningLotCostAction(formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  const lotId = String(formData.get("lot_id") ?? "");
  const cost = Number(formData.get("unit_cost"));
  try {
    await setOpeningLotCost(lotId, cost);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/inventario/lotes?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/inventario/lotes?success=Costo+de+apertura+actualizado`);
}
