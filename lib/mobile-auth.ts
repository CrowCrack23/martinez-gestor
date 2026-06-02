import "server-only";
import { getSupabase } from "./supabase";

// Puente con Supabase Auth para la app móvil (martinez-apk). Cada worker entra a
// la app con Supabase Auth usando un email sintético derivado de su username.
// El ERP web sigue usando su login propio (scrypt sobre app_users.password_hash);
// estas funciones solo mantienen sincronizada la cuenta de Auth.
//
// DEBE coincidir con martinez-apk/src/lib/supabase.ts (usernameToEmail).
export const MOBILE_EMAIL_DOMAIN = "martinez.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${MOBILE_EMAIL_DOMAIN}`;
}

async function findAuthUserByEmail(email: string) {
  const sb = getSupabase();
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Crea (o, si ya existe, actualiza la contraseña de) la cuenta de Supabase Auth
 * del worker. Devuelve el `auth.users.id`. Idempotente.
 */
export async function ensureAuthUser(
  username: string,
  password: string,
  fullName: string,
): Promise<string> {
  const sb = getSupabase();
  const email = usernameToEmail(username);
  const user_metadata = { username: username.toLowerCase(), full_name: fullName };

  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata,
  });
  if (created?.user) return created.user.id;

  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    throw new Error(`No se pudo crear el acceso móvil: ${error?.message ?? "desconocido"}`);
  }
  const { error: updErr } = await sb.auth.admin.updateUserById(existing.id, {
    password,
    user_metadata,
  });
  if (updErr) throw updErr;
  return existing.id;
}

/** Actualiza solo la contraseña de la cuenta de Auth. */
export async function setAuthUserPassword(authUserId: string, password: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.updateUserById(authUserId, { password });
  if (error) throw error;
}

/** Banea/desbanea la cuenta de Auth (para reflejar `active`). */
export async function setAuthUserBanned(authUserId: string, banned: boolean): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.updateUserById(authUserId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) throw error;
}

/** Elimina la cuenta de Auth (al borrar el usuario). */
export async function deleteAuthUser(authUserId: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.admin.deleteUser(authUserId);
  if (error) throw error;
}
