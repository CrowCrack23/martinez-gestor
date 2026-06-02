#!/usr/bin/env node
// Da de alta (o actualiza) un TRABAJADOR para la app móvil (martinez-apk).
//
// Crea/actualiza la fila en `app_users` (con su hash scrypt, para que también
// pueda entrar al ERP web) Y un usuario en Supabase Auth con un email sintético
// `<username>@martinez.local`, vinculando ambos vía `app_users.auth_user_id`.
//
// La app móvil hace login con username + contraseña; internamente usa el email
// sintético contra Supabase Auth.
//
// Uso (desde la raíz de martinez-gestor; lee .env.local automáticamente):
//   node scripts/create-mobile-user.mjs <username> <password> "<Nombre>" <rol1,rol2>
// Ejemplo:
//   node scripts/create-mobile-user.mjs juanmensajero Clave1234 "Juan Pérez" mensajero
//
// Usa la API REST/Auth de Supabase vía fetch (sin SDK). Idempotente.

import { readFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";

// Carga .env.local si las vars no están ya en el entorno.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* sin .env.local: se usan las vars del entorno */
}

const SCRYPT_KEYLEN = 64;
const EMAIL_DOMAIN = "martinez.local";

function hash(plain) {
  const salt = randomBytes(16);
  const h = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

const [username, password, fullName = "", rolesArg = ""] = process.argv.slice(2);
if (!username || !password) {
  console.error('Uso: node scripts/create-mobile-user.mjs <username> <password> "<Nombre>" <rol1,rol2>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno/.env.local.");
  process.exit(1);
}

const uname = username.toLowerCase();
const email = `${uname}@${EMAIL_DOMAIN}`;
const rest = `${url}/rest/v1`;
const auth = `${url}/auth/v1`;
const baseHeaders = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function jsonOrThrow(res, ctx) {
  if (!res.ok) {
    throw new Error(`${ctx}: ${res.status} ${await res.text()}`);
  }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// 1) app_users: upsert por username (hash scrypt para login web).
const upsertRes = await fetch(`${rest}/app_users?on_conflict=username`, {
  method: "POST",
  headers: { ...baseHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
  body: JSON.stringify({
    username: uname,
    password_hash: hash(password),
    full_name: fullName,
    active: true,
  }),
});
const [appUser] = await jsonOrThrow(upsertRes, "upsert app_users");
const appUserId = appUser.id;

// 2) Usuario de Supabase Auth: crear, o si existe, actualizar contraseña.
let authUserId = null;
const createRes = await fetch(`${auth}/admin/users`, {
  method: "POST",
  headers: baseHeaders,
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: uname, full_name: fullName },
  }),
});
if (createRes.ok) {
  authUserId = (await createRes.json()).id;
} else {
  // Probablemente ya existe: buscarlo por email y actualizar su contraseña.
  const listRes = await fetch(`${auth}/admin/users?per_page=200`, { headers: baseHeaders });
  const body = await jsonOrThrow(listRes, "listar auth users");
  const users = body.users ?? body;
  const found = users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!found) {
    throw new Error(`No se pudo crear ni encontrar el usuario de Auth: ${await createRes.text()}`);
  }
  authUserId = found.id;
  const updRes = await fetch(`${auth}/admin/users/${authUserId}`, {
    method: "PUT",
    headers: baseHeaders,
    body: JSON.stringify({ password, user_metadata: { username: uname, full_name: fullName } }),
  });
  await jsonOrThrow(updRes, "actualizar password auth");
}

// 3) Vincular ambos.
const linkRes = await fetch(`${rest}/app_users?id=eq.${appUserId}`, {
  method: "PATCH",
  headers: baseHeaders,
  body: JSON.stringify({ auth_user_id: authUserId }),
});
await jsonOrThrow(linkRes, "vincular auth_user_id");

// 4) Roles (upsert).
const roles = rolesArg.split(",").map((r) => r.trim()).filter(Boolean);
if (roles.length > 0) {
  const rolesRes = await fetch(`${rest}/user_roles?on_conflict=user_id,role_id`, {
    method: "POST",
    headers: { ...baseHeaders, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(roles.map((role_id) => ({ user_id: appUserId, role_id }))),
  });
  await jsonOrThrow(rolesRes, "asignar roles");
}

console.log(`✓ Trabajador "${uname}" listo para la app móvil.`);
console.log(`  app_user_id : ${appUserId}`);
console.log(`  auth_user_id: ${authUserId}`);
console.log(`  email login : ${email} (la app pide solo el username)`);
console.log(`  roles       : ${roles.join(", ") || "(ninguno — asígnale al menos uno)"}`);
