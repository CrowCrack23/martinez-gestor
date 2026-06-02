"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createUser, deleteUser, updateUser } from "@/lib/users";
import { optionalString, requireUsername, requireString, ValidationError } from "@/lib/validation";

function parseRoles(form: FormData): string[] {
  return form.getAll("roles").map((v) => String(v)).filter(Boolean);
}

function parseBusinesses(form: FormData): string[] {
  return form.getAll("businesses").map((v) => String(v)).filter(Boolean);
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
