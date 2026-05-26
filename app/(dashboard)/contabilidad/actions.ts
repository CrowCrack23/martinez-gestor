"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  createAccount, deleteAccount, updateAccount,
  createJournalEntry, deleteJournalEntry, postJournalEntry,
  replaceJournalLines, updateJournalEntryHeader,
  type JournalLineInput,
} from "@/lib/accounting";
import type { AccountType } from "@/lib/supabase-types";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

const TYPES: AccountType[] = ["activo", "pasivo", "patrimonio", "ingreso", "gasto"];
function parseType(v: FormDataEntryValue | null): AccountType {
  const s = String(v ?? "");
  if (!TYPES.includes(s as AccountType)) throw new ValidationError("Tipo de cuenta inválido.");
  return s as AccountType;
}

export async function createAccountAction(formData: FormData) {
  await requireRole(["admin", "contador"]);
  try {
    await createAccount({
      code: requireString(formData, "code", "Código"),
      name: requireString(formData, "name", "Nombre"),
      type: parseType(formData.get("type")),
      parent_id: optionalString(formData, "parent_id") || null,
    });
  } catch (e) { redirect(`/contabilidad/cuentas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/contabilidad/cuentas?success=Cuenta+creada`);
}

export async function updateAccountAction(id: string, formData: FormData) {
  await requireRole(["admin", "contador"]);
  try {
    await updateAccount(id, {
      code: requireString(formData, "code", "Código"),
      name: requireString(formData, "name", "Nombre"),
      type: parseType(formData.get("type")),
      parent_id: optionalString(formData, "parent_id") || null,
      active: formData.get("active") === "on",
    });
  } catch (e) { redirect(`/contabilidad/cuentas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/contabilidad/cuentas?success=Cuenta+actualizada`);
}

export async function deleteAccountAction(id: string) {
  await requireRole(["admin"]);
  try { await deleteAccount(id); }
  catch (e) { redirect(`/contabilidad/cuentas?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/contabilidad/cuentas?success=Cuenta+eliminada`);
}

// ── Journal entries ─────────────────────────────────────────────────

function parseLines(form: FormData): JournalLineInput[] {
  const accIds = form.getAll("account_id").map(String);
  const debits = form.getAll("debit").map((v) => Number(v));
  const credits = form.getAll("credit").map((v) => Number(v));
  const descs = form.getAll("line_description").map((v) => String(v));
  if (accIds.length < 2) throw new ValidationError("Un asiento requiere al menos 2 líneas.");
  if (accIds.length !== debits.length || accIds.length !== credits.length) {
    throw new ValidationError("Datos de líneas inconsistentes.");
  }
  const out: JournalLineInput[] = [];
  for (let i = 0; i < accIds.length; i++) {
    const id = accIds[i]; const d = debits[i] || 0; const c = credits[i] || 0;
    if (!id) continue;
    if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) throw new ValidationError(`Importes inválidos en línea ${i + 1}.`);
    if ((d > 0 && c > 0) || (d === 0 && c === 0)) throw new ValidationError(`Línea ${i + 1}: solo debe o haber, nunca ambos ni ninguno.`);
    out.push({ account_id: id, debit: d, credit: c, description: descs[i] ?? "" });
  }
  return out;
}

export async function createJournalEntryAction(formData: FormData) {
  const user = await requireRole(["admin", "contador"]);
  try {
    const id = await createJournalEntry({
      entry_date: requireString(formData, "entry_date", "Fecha"),
      description: optionalString(formData, "description"),
      reference_type: optionalString(formData, "reference_type") || "manual",
      reference_id: optionalString(formData, "reference_id") || null,
      created_by: user.id,
      lines: parseLines(formData),
    });
    redirect(`/contabilidad/asientos/${id}?success=Asiento+creado`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/contabilidad/asientos/nuevo?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updateJournalEntryAction(id: string, formData: FormData) {
  await requireRole(["admin", "contador"]);
  try {
    await updateJournalEntryHeader(id, {
      entry_date: requireString(formData, "entry_date", "Fecha"),
      description: optionalString(formData, "description"),
    });
    await replaceJournalLines(id, parseLines(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/contabilidad/asientos/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/contabilidad/asientos/${id}?success=Asiento+actualizado`);
}

export async function postJournalEntryAction(id: string) {
  const user = await requireRole(["admin", "contador"]);
  try { await postJournalEntry(id, user.id); }
  catch (e) { redirect(`/contabilidad/asientos/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/contabilidad/asientos/${id}?success=Asiento+contabilizado`);
}

export async function deleteJournalEntryAction(id: string) {
  await requireRole(["admin", "contador"]);
  try { await deleteJournalEntry(id); }
  catch (e) { redirect(`/contabilidad/asientos/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/contabilidad/asientos?success=Asiento+eliminado`);
}
