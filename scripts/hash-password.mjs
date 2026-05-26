#!/usr/bin/env node
// Uso:
//   node scripts/hash-password.mjs <password>         → imprime hash
//   node scripts/hash-password.mjs --secret           → imprime SESSION_SECRET
//   node scripts/hash-password.mjs --create <email> <password> <fullName> [rol1,rol2]
//     → inserta el usuario en Supabase y le asigna los roles indicados (admin por defecto).
import { scryptSync, randomBytes } from "node:crypto";

const SCRYPT_KEYLEN = 64;

function hash(plain) {
  const salt = randomBytes(16);
  const h = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${h.toString("hex")}`;
}

const args = process.argv.slice(2);

if (args[0] === "--secret") {
  console.log(randomBytes(48).toString("hex"));
  process.exit(0);
}

if (args[0] === "--create") {
  const [, email, password, fullName = "", rolesArg = "admin"] = args;
  if (!email || !password) {
    console.error("Uso: node scripts/hash-password.mjs --create <email> <password> [fullName] [rol1,rol2]");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const password_hash = hash(password);
  const { data: user, error } = await sb
    .from("app_users")
    .upsert({ email: email.toLowerCase(), password_hash, full_name: fullName, active: true }, { onConflict: "email" })
    .select()
    .single();
  if (error) { console.error(error); process.exit(1); }
  const roles = rolesArg.split(",").map((r) => r.trim()).filter(Boolean);
  if (roles.length > 0) {
    const rows = roles.map((role_id) => ({ user_id: user.id, role_id }));
    const { error: rErr } = await sb.from("user_roles").upsert(rows);
    if (rErr) { console.error(rErr); process.exit(1); }
  }
  console.log(`✓ Usuario ${email} creado/actualizado con roles: ${roles.join(", ") || "(ninguno)"}`);
  process.exit(0);
}

const password = args[0];
if (!password) {
  console.error("Uso: node scripts/hash-password.mjs <password> | --secret | --create ...");
  process.exit(1);
}
console.log(hash(password));
