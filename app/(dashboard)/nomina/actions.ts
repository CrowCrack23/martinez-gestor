"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  closePayrollRun, createPayrollRun, deletePayrollRun, updatePayrollItem,
} from "@/lib/hr";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

export async function createPayrollRunAction(formData: FormData) {
  const user = await requireRole(["admin", "rrhh"]);
  try {
    const id = await createPayrollRun({
      period_start: requireString(formData, "period_start", "Inicio"),
      period_end: requireString(formData, "period_end", "Fin"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
    });
    redirect(`/nomina/${id}?success=Per%C3%ADodo+creado+y+l%C3%ADneas+precalculadas`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/nomina/nuevo?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updatePayrollItemAction(runId: string, itemId: string, formData: FormData) {
  await requireRole(["admin", "rrhh"]);
  try {
    const days = Number(formData.get("days_worked") ?? 0);
    const gross = Number(formData.get("gross") ?? 0);
    const ded = Number(formData.get("deductions") ?? 0);
    if (!Number.isFinite(days) || days < 0) throw new ValidationError("Días inválidos.");
    if (!Number.isFinite(gross) || gross < 0) throw new ValidationError("Bruto inválido.");
    if (!Number.isFinite(ded) || ded < 0) throw new ValidationError("Deducciones inválidas.");
    await updatePayrollItem(itemId, {
      days_worked: days, gross, deductions: ded,
      notes: optionalString(formData, "notes"),
    });
  } catch (e) {
    redirect(`/nomina/${runId}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/nomina/${runId}?success=L%C3%ADnea+actualizada`);
}

export async function closePayrollRunAction(id: string) {
  const user = await requireRole(["admin", "rrhh"]);
  try { await closePayrollRun(id, user.id); }
  catch (e) { redirect(`/nomina/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/nomina/${id}?success=N%C3%B3mina+cerrada`);
}

export async function deletePayrollRunAction(id: string) {
  // Borrar es exclusivo del dueño (requisito del cliente).
  await requireRole(["admin"]);
  try { await deletePayrollRun(id); }
  catch (e) { redirect(`/nomina/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/nomina?success=Per%C3%ADodo+eliminado`);
}
