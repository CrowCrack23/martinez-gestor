"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  cancelRemittance, createRemittance, deleteRemittance, payRemittance,
  updateRemittance, upsertExchangeRate, deleteExchangeRate,
} from "@/lib/remittances";
import type { RemittancePayoutMethod, RemittanceOrigin } from "@/lib/supabase-types";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

const METHODS: RemittancePayoutMethod[] = ["efectivo", "tarjeta_cup", "transferencia", "otro"];
function parseMethod(v: FormDataEntryValue | null): RemittancePayoutMethod {
  const s = String(v ?? "efectivo");
  if (!METHODS.includes(s as RemittancePayoutMethod)) throw new ValidationError("Método de pago inválido.");
  return s as RemittancePayoutMethod;
}

const ORIGINS: RemittanceOrigin[] = ["eeuu", "europa"];
function parseOrigin(v: FormDataEntryValue | null): RemittanceOrigin {
  const s = String(v ?? "eeuu");
  if (!ORIGINS.includes(s as RemittanceOrigin)) throw new ValidationError("Origen inválido.");
  return s as RemittanceOrigin;
}

function parseFields(form: FormData) {
  const usd = Number(form.get("amount_usd") ?? 0);
  const rate = Number(form.get("exchange_rate") ?? 0);
  const comm = Number(form.get("commission_usd") ?? 0);
  if (!Number.isFinite(usd) || usd <= 0) throw new ValidationError("Monto enviado inválido.");
  if (!Number.isFinite(rate) || rate <= 0) throw new ValidationError("Tasa de cambio inválida.");
  if (!Number.isFinite(comm) || comm < 0) throw new ValidationError("Comisión inválida.");
  return {
    sender_name: requireString(form, "sender_name", "Remitente"),
    sender_phone: optionalString(form, "sender_phone"),
    beneficiary_name: requireString(form, "beneficiary_name", "Beneficiario"),
    beneficiary_phone: optionalString(form, "beneficiary_phone"),
    beneficiary_doc: optionalString(form, "beneficiary_doc"),
    beneficiary_address: optionalString(form, "beneficiary_address"),
    amount_usd: usd,
    exchange_rate: rate,
    commission_usd: comm,
    origin: parseOrigin(form.get("origin")),
    payout_method: parseMethod(form.get("payout_method")),
    notes: optionalString(form, "notes"),
  };
}

export async function createRemittanceAction(formData: FormData) {
  const user = await requireRole(["admin", "vendedor", "contador"]);
  try {
    const id = await createRemittance({ ...parseFields(formData), created_by: user.id });
    redirect(`/remesas/${id}?success=Remesa+creada`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/nueva?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updateRemittanceAction(id: string, formData: FormData) {
  await requireRole(["admin", "vendedor", "contador"]);
  try { await updateRemittance(id, parseFields(formData)); }
  catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/${id}?success=Remesa+actualizada`);
}

export async function payRemittanceAction(id: string) {
  const user = await requireRole(["admin", "vendedor"]);
  try { await payRemittance(id, user.id); }
  catch (e) { redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/${id}?success=Remesa+marcada+como+entregada`);
}

export async function cancelRemittanceAction(id: string) {
  await requireRole(["admin", "vendedor"]);
  try { await cancelRemittance(id); }
  catch (e) { redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/${id}?success=Remesa+cancelada`);
}

export async function deleteRemittanceAction(id: string) {
  await requireRole(["admin"]);
  try { await deleteRemittance(id); }
  catch (e) { redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas?success=Remesa+eliminada`);
}

// ── Exchange rates ────────────────────────────────────────────────────

export async function upsertExchangeRateAction(formData: FormData) {
  await requireRole(["admin", "contador"]);
  try {
    const day = requireString(formData, "day", "Fecha");
    const rate = Number(formData.get("rate") ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) throw new ValidationError("Tasa inválida.");
    await upsertExchangeRate({
      day,
      currency_from: optionalString(formData, "currency_from") || "USD",
      currency_to: optionalString(formData, "currency_to") || "CUP",
      rate,
      notes: optionalString(formData, "notes"),
    });
  } catch (e) { redirect(`/remesas/tasas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/tasas?success=Tasa+guardada`);
}

export async function deleteExchangeRateAction(day: string, currency_from: string, currency_to: string) {
  await requireRole(["admin"]);
  try { await deleteExchangeRate(day, currency_from, currency_to); }
  catch (e) { redirect(`/remesas/tasas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/tasas?success=Tasa+eliminada`);
}
