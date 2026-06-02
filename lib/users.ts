import "server-only";
import { randomBytes, scryptSync } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import {
  deleteAuthUser,
  ensureAuthUser,
  setAuthUserBanned,
  setAuthUserPassword,
} from "./mobile-auth";

const TAG = "app_users";

function bust() {
  revalidateTag(TAG, "max");
}

export type Membership = { business: string; role: string; commission_pct: number };

export type AppUserWithRoles = {
  id: string;
  username: string;
  full_name: string;
  active: boolean;
  created_at: string;
  roles: string[];
  businesses: string[];
  memberships: Membership[];
};

export type Role = { id: string; name: string; description: string };

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const h = scryptSync(plain, salt, 64);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

export const listRoles = unstable_cache(
  async (): Promise<Role[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("roles").select("*").order("id");
    if (error) throw error;
    return data ?? [];
  },
  ["roles_all"],
  { revalidate: 300, tags: ["roles"] },
);

export const listUsers = unstable_cache(
  async (): Promise<AppUserWithRoles[]> => {
    const sb = getSupabase();
    const { data: users, error } = await sb
      .from("app_users")
      .select("id,username,full_name,active,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!users || users.length === 0) return [];
    const ids = users.map((u) => u.id);
    const [{ data: roles }, { data: biz }, { data: mem }] = await Promise.all([
      sb.from("user_roles").select("user_id,role_id").in("user_id", ids),
      sb.from("user_businesses").select("user_id,store_slug").in("user_id", ids),
      sb.from("business_members").select("user_id,business_slug,role_id,commission_pct").in("user_id", ids),
    ]);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role_id);
      rolesByUser.set(r.user_id, arr);
    }
    const bizByUser = new Map<string, string[]>();
    for (const b of biz ?? []) {
      const arr = bizByUser.get(b.user_id) ?? [];
      arr.push(b.store_slug);
      bizByUser.set(b.user_id, arr);
    }
    const memByUser = new Map<string, Membership[]>();
    for (const m of mem ?? []) {
      const arr = memByUser.get(m.user_id) ?? [];
      arr.push({ business: m.business_slug, role: m.role_id, commission_pct: Number(m.commission_pct) });
      memByUser.set(m.user_id, arr);
    }
    return users.map((u) => ({
      ...u,
      roles: rolesByUser.get(u.id) ?? [],
      businesses: bizByUser.get(u.id) ?? [],
      memberships: memByUser.get(u.id) ?? [],
    }));
  },
  ["users_all"],
  { revalidate: 30, tags: [TAG] },
);

/** Usuarios activos que tienen un rol dado (p.ej. mensajeros para asignar remesas). */
export async function listUsersByRole(roleId: string): Promise<{ id: string; full_name: string; username: string }[]> {
  const users = await listUsers();
  return users
    .filter((u) => u.active && u.roles.includes(roleId))
    .map((u) => ({ id: u.id, full_name: u.full_name, username: u.username }));
}

export async function createUser(input: {
  username: string;
  password: string;
  full_name: string;
  roles: string[];
  businesses: string[];
  /** Rol(es) dentro del negocio "remesas" (modelo por membresía). */
  remesasMemberships?: { role: string; commission_pct: number }[];
}): Promise<string> {
  const sb = getSupabase();
  const username = input.username.toLowerCase();
  const { data, error } = await sb
    .from("app_users")
    .insert({
      username,
      password_hash: hashPassword(input.password),
      full_name: input.full_name,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
  // Aprovisiona la cuenta de Supabase Auth (acceso a la app móvil) y la vincula.
  const authUserId = await ensureAuthUser(username, input.password, input.full_name);
  const { error: linkErr } = await sb
    .from("app_users")
    .update({ auth_user_id: authUserId })
    .eq("id", data.id);
  if (linkErr) throw linkErr;
  if (input.roles.length > 0) {
    const rows = input.roles.map((role_id) => ({ user_id: data.id, role_id }));
    const { error: rErr } = await sb.from("user_roles").insert(rows);
    if (rErr) throw rErr;
  }
  if (input.businesses.length > 0) {
    const rows = input.businesses.map((store_slug) => ({ user_id: data.id, store_slug }));
    const { error: bErr } = await sb.from("user_businesses").insert(rows);
    if (bErr) throw bErr;
  }
  await setRemesasMemberships(data.id, input.remesasMemberships ?? []);
  bust();
  return data.id;
}

/** Reemplaza las membresías del usuario en el negocio "remesas". */
async function setRemesasMemberships(
  userId: string,
  memberships: { role: string; commission_pct: number }[],
): Promise<void> {
  const sb = getSupabase();
  await sb.from("business_members").delete().eq("user_id", userId).eq("business_slug", "remesas");
  if (memberships.length > 0) {
    const rows = memberships.map((m) => ({
      user_id: userId,
      business_slug: "remesas",
      role_id: m.role,
      commission_pct: m.role === "gestor" ? m.commission_pct : 0,
    }));
    const { error } = await sb.from("business_members").insert(rows);
    if (error) throw error;
  }
}

export async function updateUser(
  id: string,
  patch: {
    full_name?: string;
    active?: boolean;
    password?: string;
    roles?: string[];
    businesses?: string[];
    remesasMemberships?: { role: string; commission_pct: number }[];
  },
): Promise<void> {
  const sb = getSupabase();
  const { data: current, error: curErr } = await sb
    .from("app_users")
    .select("username, full_name, auth_user_id")
    .eq("id", id)
    .single();
  if (curErr) throw curErr;

  const userPatch: { full_name?: string; active?: boolean; password_hash?: string } = {};
  if (patch.full_name !== undefined) userPatch.full_name = patch.full_name;
  if (patch.active !== undefined) userPatch.active = patch.active;
  if (patch.password) userPatch.password_hash = hashPassword(patch.password);
  if (Object.keys(userPatch).length > 0) {
    const { error } = await sb.from("app_users").update(userPatch).eq("id", id);
    if (error) throw error;
  }

  // Sincroniza la cuenta de Supabase Auth (acceso a la app móvil).
  const fullName = patch.full_name ?? current.full_name;
  if (patch.password) {
    if (current.auth_user_id) {
      await setAuthUserPassword(current.auth_user_id, patch.password);
    } else {
      // Aún sin cuenta de Auth (usuario antiguo): crearla y vincularla.
      const authUserId = await ensureAuthUser(current.username, patch.password, fullName);
      const { error: linkErr } = await sb
        .from("app_users")
        .update({ auth_user_id: authUserId })
        .eq("id", id);
      if (linkErr) throw linkErr;
    }
  }
  if (patch.active !== undefined && current.auth_user_id) {
    await setAuthUserBanned(current.auth_user_id, !patch.active);
  }
  if (patch.roles) {
    await sb.from("user_roles").delete().eq("user_id", id);
    if (patch.roles.length > 0) {
      const rows = patch.roles.map((role_id) => ({ user_id: id, role_id }));
      const { error: rErr } = await sb.from("user_roles").insert(rows);
      if (rErr) throw rErr;
    }
  }
  if (patch.businesses) {
    await sb.from("user_businesses").delete().eq("user_id", id);
    if (patch.businesses.length > 0) {
      const rows = patch.businesses.map((store_slug) => ({ user_id: id, store_slug }));
      const { error: bErr } = await sb.from("user_businesses").insert(rows);
      if (bErr) throw bErr;
    }
  }
  if (patch.remesasMemberships) {
    await setRemesasMemberships(id, patch.remesasMemberships);
  }
  bust();
}

export async function deleteUser(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: current } = await sb
    .from("app_users")
    .select("auth_user_id")
    .eq("id", id)
    .maybeSingle();
  // Borra primero la cuenta de Auth para que no quede acceso móvil huérfano.
  if (current?.auth_user_id) await deleteAuthUser(current.auth_user_id);
  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) throw error;
  bust();
}
