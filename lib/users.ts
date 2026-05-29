import "server-only";
import { randomBytes, scryptSync } from "node:crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";

const TAG = "app_users";

function bust() {
  revalidateTag(TAG, "max");
}

export type AppUserWithRoles = {
  id: string;
  email: string;
  full_name: string;
  active: boolean;
  created_at: string;
  roles: string[];
  businesses: string[];
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
      .select("id,email,full_name,active,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!users || users.length === 0) return [];
    const ids = users.map((u) => u.id);
    const [{ data: roles }, { data: biz }] = await Promise.all([
      sb.from("user_roles").select("user_id,role_id").in("user_id", ids),
      sb.from("user_businesses").select("user_id,store_slug").in("user_id", ids),
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
    return users.map((u) => ({
      ...u,
      roles: rolesByUser.get(u.id) ?? [],
      businesses: bizByUser.get(u.id) ?? [],
    }));
  },
  ["users_all"],
  { revalidate: 30, tags: [TAG] },
);

export async function createUser(input: {
  email: string;
  password: string;
  full_name: string;
  roles: string[];
  businesses: string[];
}): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_users")
    .insert({
      email: input.email.toLowerCase(),
      password_hash: hashPassword(input.password),
      full_name: input.full_name,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw error;
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
  bust();
  return data.id;
}

export async function updateUser(
  id: string,
  patch: { full_name?: string; active?: boolean; password?: string; roles?: string[]; businesses?: string[] },
): Promise<void> {
  const sb = getSupabase();
  const userPatch: { full_name?: string; active?: boolean; password_hash?: string } = {};
  if (patch.full_name !== undefined) userPatch.full_name = patch.full_name;
  if (patch.active !== undefined) userPatch.active = patch.active;
  if (patch.password) userPatch.password_hash = hashPassword(patch.password);
  if (Object.keys(userPatch).length > 0) {
    const { error } = await sb.from("app_users").update(userPatch).eq("id", id);
    if (error) throw error;
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
  bust();
}

export async function deleteUser(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("app_users").delete().eq("id", id);
  if (error) throw error;
  bust();
}
