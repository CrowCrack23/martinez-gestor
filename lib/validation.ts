export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireString(form: FormData, key: string, label: string): string {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ValidationError(`${label} es obligatorio.`);
  }
  return raw.trim();
}

export function optionalString(form: FormData, key: string): string {
  const raw = form.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export function requireInt(form: FormData, key: string, label: string, opts?: { min?: number; max?: number; allowNegative?: boolean }): number {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new ValidationError(`${label} es obligatorio.`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${label} debe ser un entero.`);
  }
  if (!opts?.allowNegative && n < 0) {
    throw new ValidationError(`${label} no puede ser negativo.`);
  }
  if (opts?.min !== undefined && n < opts.min) {
    throw new ValidationError(`${label} debe ser ≥ ${opts.min}.`);
  }
  if (opts?.max !== undefined && n > opts.max) {
    throw new ValidationError(`${label} debe ser ≤ ${opts.max}.`);
  }
  return n;
}

export function optionalInt(form: FormData, key: string, label: string, opts?: { min?: number }): number | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new ValidationError(`${label} debe ser un entero.`);
  }
  if (opts?.min !== undefined && n < opts.min) {
    throw new ValidationError(`${label} debe ser ≥ ${opts.min}.`);
  }
  return n;
}

/** Fecha YYYY-MM-DD obligatoria (input type="date"). */
export function requireDate(form: FormData, key: string, label: string): string {
  const raw = form.get(key);
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    throw new ValidationError(`${label} es obligatoria.`);
  }
  return raw.trim();
}

/** Fecha YYYY-MM-DD opcional; null si no viene. */
export function optionalDate(form: FormData, key: string): string | null {
  const raw = form.get(key);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) throw new ValidationError("Fecha inválida.");
  return raw.trim();
}

export function requireEmail(form: FormData, key: string): string {
  const raw = requireString(form, key, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    throw new ValidationError("Email inválido.");
  }
  return raw;
}

export function requireUsername(form: FormData, key: string): string {
  const raw = requireString(form, key, "Usuario").toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(raw)) {
    throw new ValidationError("El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.");
  }
  return raw;
}
