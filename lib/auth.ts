import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";
import {
  SESSION_COOKIE,
  SESSION_DURATION_SECONDS,
  createSessionToken,
  getSessionSecret,
  verifySessionToken,
} from "./session";
import { roleListHasPermission, type Permission } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  /** Tiendas (negocios) a las que el usuario está asignado. */
  businesses: string[];
  /** true si ve todos los negocios (rol admin). */
  allBusinesses: boolean;
};

/**
 * Alcance de negocios para filtrar consultas:
 *  - undefined → sin límite (admin, ve todo)
 *  - string[]  → limitar a esas tiendas (puede ser [] = no ve nada)
 */
export function businessScope(user: CurrentUser): string[] | undefined {
  return user.allBusinesses ? undefined : user.businesses;
}

/** Roles que operan remesas a pleno (crean, editan, ven todas). */
const REMITTANCE_FULL_ROLES = ["admin", "vendedor", "contador"];

/**
 * Alcance de remesas para un usuario:
 *  - undefined → ve todas (admin/vendedor/contador).
 *  - string    → es mensajero: solo ve/opera las remesas asignadas a su id.
 * Un usuario con un rol "pleno" siempre ve todo, aunque también sea mensajero.
 */
export function remittanceAssignee(user: CurrentUser): string | undefined {
  if (user.roles.some((r) => REMITTANCE_FULL_ROLES.includes(r))) return undefined;
  if (user.roles.includes("mensajero")) return user.id;
  return undefined;
}

function parseHash(raw: string): { salt: Buffer; hash: Buffer } | null {
  const [saltHex, hashHex] = raw.split(":");
  if (!saltHex || !hashHex) return null;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const hash = Buffer.from(hashHex, "hex");
    if (salt.length === 0 || hash.length === 0) return null;
    return { salt, hash };
  } catch {
    return null;
  }
}

export function verifyPasswordAgainstHash(input: string, storedHash: string): boolean {
  const stored = parseHash(storedHash);
  if (!stored) return false;
  const candidate = scryptSync(input, stored.salt, stored.hash.length);
  if (candidate.length !== stored.hash.length) return false;
  return timingSafeEqual(candidate, stored.hash);
}

const loadUser = unstable_cache(
  async (userId: string): Promise<CurrentUser | null> => {
    const sb = getSupabase();
    const { data: u, error } = await sb
      .from("app_users")
      .select("id,email,full_name,active")
      .eq("id", userId)
      .maybeSingle();
    if (error || !u || !u.active) return null;
    const [{ data: rs }, { data: bs }] = await Promise.all([
      sb.from("user_roles").select("role_id").eq("user_id", userId),
      sb.from("user_businesses").select("store_slug").eq("user_id", userId),
    ]);
    const roles = (rs ?? []).map((r) => r.role_id);
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      roles,
      businesses: (bs ?? []).map((b) => b.store_slug),
      allBusinesses: roles.includes("admin"),
    };
  },
  ["app_user_with_roles"],
  { revalidate: 30, tags: ["app_users"] },
);

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, getSessionSecret());
  if (!session) return null;
  return loadUser(session.userId);
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireRole(allowed: string[]): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.roles.some((r) => allowed.includes(r))) {
    redirect("/?error=No+tienes+permiso");
  }
  return u;
}

export function hasRole(user: CurrentUser | null, allowed: string[]): boolean {
  if (!user) return false;
  return user.roles.some((r) => allowed.includes(r));
}

/** ¿El usuario tiene acceso al módulo (permiso) indicado? */
export function hasPermission(user: CurrentUser | null, perm: Permission): boolean {
  if (!user) return false;
  return roleListHasPermission(user.roles, perm);
}

/** Exige sesión + permiso de módulo; si falta, manda a /sin-acceso. */
export async function requirePermission(perm: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!roleListHasPermission(u.roles, perm)) {
    redirect("/sin-acceso");
  }
  return u;
}

export async function signIn(email: string, password: string): Promise<CurrentUser> {
  const sb = getSupabase();
  const { data: u, error } = await sb
    .from("app_users")
    .select("id,email,password_hash,full_name,active")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error || !u || !u.active) {
    throw new Error("Credenciales inválidas.");
  }
  if (!verifyPasswordAgainstHash(password, u.password_hash)) {
    throw new Error("Credenciales inválidas.");
  }
  const [{ data: rs }, { data: bs }] = await Promise.all([
    sb.from("user_roles").select("role_id").eq("user_id", u.id),
    sb.from("user_businesses").select("store_slug").eq("user_id", u.id),
  ]);
  const roles = (rs ?? []).map((r) => r.role_id);

  const token = await createSessionToken(u.id, getSessionSecret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
  });

  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    roles,
    businesses: (bs ?? []).map((b) => b.store_slug),
    allBusinesses: roles.includes("admin"),
  };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
