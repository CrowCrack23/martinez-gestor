"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createUser, deleteUser, updateUser } from "@/lib/users";
import { REMESAS_ROLES, type RemesasRole } from "@/lib/permissions";
import { optionalString, requireUsername, requireString, ValidationError } from "@/lib/validation";

// Los roles de remesas se gestionan como membresía, no como roles globales: se
// excluyen del campo "roles" por si acaso llegaran.
function parseRoles(form: FormData): string[] {
  return form
    .getAll("roles")
    .map((v) => String(v))
    .filter((r) => r && !REMESAS_ROLES.includes(r as RemesasRole));
}

function parseBusinesses(form: FormData): string[] {
  return form.getAll("businesses").map((v) => String(v)).filter(Boolean);
}

function parseRemesasMemberships(form: FormData): { role: string; commission_pct: number }[] {
  const roles = form
    .getAll("remesas_roles")
    .map((v) => String(v))
    .filter((r) => REMESAS_ROLES.includes(r as RemesasRole));
  const pct = Number(form.get("gestor_commission_pct") ?? 0);
  const commission_pct = Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : 0;
  return roles.map((role) => ({ role, commission_pct: role === "gestor" ? commission_pct : 0 }));
}

export async function createUserAction(formData: FormData) {
  await requireRole(["admin"]);
  try {
    const password = requireString(formData, "password", "Contraseña");
    if (password.length < 8) throw new ValidationError("La contraseña debe tener al menos 8 caracteres.");
    await createUser({
      username: requireUsername(formData, "username"),
      password,
      full_name: optionalString(formData, "full_name"),
      roles: parseRoles(formData),
      businesses: parseBusinesses(formData),
      remesasMemberships: parseRemesasMemberships(formData),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/usuarios/nuevo?error=${encodeURIComponent(msg)}`);
  }
  redirect("/usuarios?success=Usuario+creado");
}

export async function updateUserAction(id: string, formData: FormData) {
  await requireRole(["admin"]);
  try {
    const newPwd = optionalString(formData, "password");
    if (newPwd && newPwd.length < 8) throw new ValidationError("La nueva contraseña debe tener al menos 8 caracteres.");
    await updateUser(id, {
      full_name: optionalString(formData, "full_name"),
      active: formData.get("active") === "on",
      password: newPwd || undefined,
      roles: parseRoles(formData),
      businesses: parseBusinesses(formData),
      remesasMemberships: parseRemesasMemberships(formData),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/usuarios/${id}?error=${encodeURIComponent(msg)}`);
  }
  redirect("/usuarios?success=Usuario+actualizado");
}

export async function deleteUserAction(id: string) {
  await requireRole(["admin"]);
  try {
    await deleteUser(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/usuarios?error=${encodeURIComponent(msg)}`);
  }
  redirect("/usuarios?success=Usuario+eliminado");
}
