"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  createEmployee, deleteEmployee, updateEmployee,
  createPosition, deletePosition, updatePosition,
} from "@/lib/hr";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parseEmployee(form: FormData) {
  const monthly = Number(form.get("monthly_salary") ?? 0);
  if (!Number.isFinite(monthly) || monthly < 0) throw new ValidationError("Salario inválido.");
  return {
    code: requireString(form, "code", "Código").toUpperCase(),
    first_name: requireString(form, "first_name", "Nombre"),
    last_name: optionalString(form, "last_name"),
    document_id: optionalString(form, "document_id"),
    phone: optionalString(form, "phone"),
    email: optionalString(form, "email").toLowerCase(),
    address: optionalString(form, "address"),
    hire_date: optionalString(form, "hire_date") || null,
    position_id: optionalString(form, "position_id") || null,
    warehouse_id: optionalString(form, "warehouse_id") || null,
    monthly_salary: monthly,
    notes: optionalString(form, "notes"),
  };
}

export async function createEmployeeAction(formData: FormData) {
  const user = await requireRole(["admin", "rrhh"]);
  try {
    const id = await createEmployee({ ...parseEmployee(formData), active: true });
    void user;
    redirect(`/empleados/${id}?success=Empleado+creado`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/empleados/nuevo?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updateEmployeeAction(id: string, formData: FormData) {
  await requireRole(["admin", "rrhh"]);
  try {
    await updateEmployee(id, {
      ...parseEmployee(formData),
      active: formData.get("active") === "on",
      termination_date: optionalString(formData, "termination_date") || null,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/empleados/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/empleados/${id}?success=Empleado+actualizado`);
}

export async function deleteEmployeeAction(id: string) {
  await requireRole(["admin"]);
  try { await deleteEmployee(id); }
  catch (e) { redirect(`/empleados?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/empleados?success=Empleado+eliminado`);
}

// ── Positions ─────────────────────────────────────────────────────────

export async function createPositionAction(formData: FormData) {
  await requireRole(["admin", "rrhh"]);
  try {
    const base = Number(formData.get("base_salary") ?? 0);
    await createPosition({
      name: requireString(formData, "name", "Nombre"),
      description: optionalString(formData, "description"),
      base_salary: Number.isFinite(base) && base >= 0 ? base : 0,
    });
  } catch (e) { redirect(`/empleados/posiciones?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/empleados/posiciones?success=Posici%C3%B3n+creada`);
}

export async function updatePositionAction(id: string, formData: FormData) {
  await requireRole(["admin", "rrhh"]);
  try {
    const base = Number(formData.get("base_salary") ?? 0);
    await updatePosition(id, {
      name: requireString(formData, "name", "Nombre"),
      description: optionalString(formData, "description"),
      base_salary: Number.isFinite(base) && base >= 0 ? base : 0,
      active: formData.get("active") === "on",
    });
  } catch (e) { redirect(`/empleados/posiciones?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/empleados/posiciones?success=Posici%C3%B3n+actualizada`);
}

export async function deletePositionAction(id: string) {
  await requireRole(["admin"]);
  try { await deletePosition(id); }
  catch (e) { redirect(`/empleados/posiciones?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/empleados/posiciones?success=Posici%C3%B3n+eliminada`);
}
