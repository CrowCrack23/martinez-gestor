"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  addContribution,
  createPartner,
  deleteContribution,
  deletePartner,
  setGrowthPct,
  updatePartner,
} from "@/lib/partners";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parsePct(form: FormData, field: string): number {
  const pct = Number(form.get(field) ?? NaN);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new ValidationError("El % debe estar entre 0 y 100.");
  }
  return pct;
}

export async function createPartnerAction(formData: FormData) {
  await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    await createPartner({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      name: requireString(formData, "name", "Nombre"),
      profit_pct: parsePct(formData, "profit_pct"),
      notes: optionalString(formData, "notes"),
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios?business=${business}&success=Socio+creado`);
}

export async function updatePartnerAction(id: string, business: string, formData: FormData) {
  await requireRole(["admin"]);
  try {
    await updatePartner(id, {
      profit_pct: parsePct(formData, "profit_pct"),
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios?business=${business}&success=Socio+actualizado`);
}

export async function togglePartnerAction(id: string, business: string, active: boolean) {
  await requireRole(["admin"]);
  try {
    await updatePartner(id, { active });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios?business=${business}&success=Socio+actualizado`);
}

export async function deletePartnerAction(id: string, business: string) {
  await requireRole(["admin"]);
  try {
    await deletePartner(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios?business=${business}&success=Socio+eliminado`);
}

export async function setGrowthPctAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    await setGrowthPct(
      requireString(formData, "business_slug", "Negocio"),
      parsePct(formData, "growth_pct"),
      user.id,
    );
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios?business=${business}&success=%25+de+crecimiento+guardado`);
}

export async function addContributionAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const amount = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Monto inválido.");
    const currency = String(formData.get("currency") ?? "CUP");
    if (currency !== "CUP" && currency !== "USD") throw new ValidationError("Moneda inválida.");
    await addContribution({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      partner_id: requireString(formData, "partner_id", "Socio"),
      amount,
      currency,
      contributed_at: requireString(formData, "contributed_at", "Fecha"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios/aportes?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios/aportes?business=${business}&success=Aporte+registrado`);
}

export async function deleteContributionAction(id: string, business: string) {
  await requireRole(["admin"]);
  try {
    await deleteContribution(id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/socios/aportes?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/socios/aportes?business=${business}&success=Aporte+eliminado`);
}
