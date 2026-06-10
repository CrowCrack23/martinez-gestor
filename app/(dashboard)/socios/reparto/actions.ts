"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { confirmDistribution, markPartnerPaid, reopenDistribution } from "@/lib/profit-sharing";
import { requireString } from "@/lib/validation";

export async function confirmDistributionAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  const month = String(formData.get("month") ?? "");
  try {
    await confirmDistribution(
      requireString(formData, "business_slug", "Negocio"),
      requireString(formData, "month", "Mes"),
      formData.get("include_drafts") === "on",
      user.id,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios/reparto?business=${business}&month=${month}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios/reparto?business=${business}&month=${month}&success=Reparto+confirmado`);
}

export async function reopenDistributionAction(business: string, month: string) {
  await requireRole(["admin"]);
  try {
    await reopenDistribution(business, month);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios/reparto?business=${business}&month=${month}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios/reparto?business=${business}&month=${month}&success=Reparto+reabierto`);
}

export async function markPartnerPaidAction(lineId: string, business: string, month: string, formData: FormData) {
  const user = await requireRole(["admin"]);
  try {
    await markPartnerPaid(lineId, requireString(formData, "paid_at", "Fecha de pago"), user.id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios/reparto?business=${business}&month=${month}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios/reparto?business=${business}&month=${month}&success=Pago+registrado`);
}
