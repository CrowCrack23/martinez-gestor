// Edge-safe: solo Web Crypto. Importable desde proxy.ts y server actions.
//
// Token payload: v1.<userId>.<exp>.<sig>  (HMAC-SHA256 sobre v1.<userId>.<exp>)

export const SESSION_COOKIE = "mg_gestor";

const TOKEN_VERSION = "v1";
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8h
export const SESSION_DURATION_SECONDS = Math.floor(SESSION_DURATION_MS / 1000);

const encoder = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
  const exp = Date.now() + SESSION_DURATION_MS;
  const payload = `${TOKEN_VERSION}.${userId}.${exp}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload) as BufferSource,
  );
  return `${payload}.${b64url(sig)}`;
}

export type VerifiedSession = { userId: string; exp: number };

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<VerifiedSession | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [ver, userId, expStr, sigB64] = parts;
  if (ver !== TOKEN_VERSION || !userId || !expStr || !sigB64) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp <= Date.now()) return null;
  try {
    const key = await importKey(secret);
    const sig = b64urlDecode(sigB64);
    const payload = `${ver}.${userId}.${expStr}`;
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sig as BufferSource,
      encoder.encode(payload) as BufferSource,
    );
    return ok ? { userId, exp } : null;
  } catch {
    return null;
  }
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET no configurado o demasiado corto (≥32 chars).",
    );
  }
  return "dev-only-insecure-secret-do-not-use-in-production-please";
}
