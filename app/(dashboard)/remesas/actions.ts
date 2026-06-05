"use server";
import { redirect } from "next/navigation";
import { requireRole, remittanceAssignee } from "@/lib/auth";
import {
  cancelRemittance, createRemittance, deleteRemittance, payRemittance,
  updateRemittance, upsertExchangeRate, deleteExchangeRate, getRemittance,
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
    assigned_to: optionalString(form, "assigned_to") || null,
    courier_fee_cup: parseCourierFee(form),
  };
}

/** Pago al mensajero por la entrega (CUP). Manual por remesa; 0 si no aplica. */
function parseCourierFee(form: FormData): number {
  const raw = form.get("courier_fee_cup");
  if (raw == null || String(raw).trim() === "") return 0;
  const fee = Number(raw);
  if (!Number.isFinite(fee) || fee < 0) throw new ValidationError("Pago al mensajero inválido.");
  return fee;
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

/**
 * El mensajero solo puede operar (entregar/cancelar) las remesas que tiene
 * asignadas. Los roles plenos (admin/vendedor) operan cualquiera.
 */
async function assertCanOperate(id: string, user: Awaited<ReturnType<typeof requireRole>>) {
  const assignee = remittanceAssignee(user);
  if (!assignee) return; // rol pleno
  const r = await getRemittance(id);
  if (!r || r.assigned_to !== assignee) {
    redirect(`/remesas?error=${encodeURIComponent("No tienes esta remesa asignada.")}`);
  }
}

const DELIVERY_CURRENCIES = ["CUP", "USD", "EUR"] as const;

export async function payRemittanceAction(id: string, formData?: FormData) {
  const user = await requireRole(["admin", "vendedor", "mensajero"]);
  await assertCanOperate(id, user);
  try {
    // Datos de entrega (opcionales): moneda, monto, tasa al cliente y tasa de
    // costo. Sin ellos se asume entrega en CUP a la tasa registrada.
    let delivery: Parameters<typeof payRemittance>[2];
    const cur = String(formData?.get("delivery_currency") ?? "");
    if (cur) {
      if (!DELIVERY_CURRENCIES.includes(cur as (typeof DELIVERY_CURRENCIES)[number])) {
        throw new ValidationError("Moneda de entrega inválida.");
      }
      const amount = Number(formData?.get("delivery_amount") ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("Monto entregado inválido.");
      const rateRaw = formData?.get("delivery_rate");
      const costRaw = formData?.get("delivery_cost_rate");
      delivery = {
        currency: cur as (typeof DELIVERY_CURRENCIES)[number],
        amount,
        rate: rateRaw && String(rateRaw).trim() !== "" ? Number(rateRaw) : null,
        cost_rate: costRaw && String(costRaw).trim() !== "" ? Number(costRaw) : null,
      };
    }
    await payRemittance(id, user.id, delivery);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/${id}?success=Remesa+marcada+como+entregada`);
}

export async function cancelRemittanceAction(id: string) {
  const user = await requireRole(["admin", "vendedor", "mensajero"]);
  await assertCanOperate(id, user);
  try { await cancelRemittance(id); }
  catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
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
    const CURRENCIES = ["USD", "EUR", "CUP"];
    const currency_from = optionalString(formData, "currency_from") || "USD";
    const currency_to = optionalString(formData, "currency_to") || "CUP";
    if (!CURRENCIES.includes(currency_from) || !CURRENCIES.includes(currency_to) || currency_from === currency_to) {
      throw new ValidationError("Moneda inválida.");
    }
    await upsertExchangeRate({ day, currency_from, currency_to, rate, notes: optionalString(formData, "notes") });
  } catch (e) { redirect(`/remesas/tasas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/tasas?success=Tasa+guardada`);
}

export async function deleteExchangeRateAction(day: string, currency_from: string, currency_to: string) {
  await requireRole(["admin"]);
  try { await deleteExchangeRate(day, currency_from, currency_to); }
  catch (e) { redirect(`/remesas/tasas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/remesas/tasas?success=Tasa+eliminada`);
}
