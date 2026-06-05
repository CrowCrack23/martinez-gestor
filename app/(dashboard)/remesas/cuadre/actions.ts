"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { confirmWeeklyClosure, markRemittancePartnerPaid } from "@/lib/remittance-closures";
import { requireString } from "@/lib/validation";

export async function confirmRemittanceClosureAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  const week = String(formData.get("week_start") ?? "");
  try {
    await confirmWeeklyClosure(
      requireString(formData, "business_slug", "Negocio"),
      requireString(formData, "week_start", "Semana"),
      user.id,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/cuadre?business=${business}&week=${week}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/cuadre?business=${business}&week=${week}&success=Cuadre+confirmado`);
}

export async function markRemittancePartnerPaidAction(lineId: string, business: string, week: string, formData: FormData) {
  const user = await requireRole(["admin"]);
  try {
    await markRemittancePartnerPaid(lineId, requireString(formData, "paid_at", "Fecha de pago"), user.id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/cuadre?business=${business}&week=${week}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/cuadre?business=${business}&week=${week}&success=Pago+registrado`);
}
