import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import type { Database, AccountType, DeliveryCurrency, JournalEntryStatus } from "./supabase-types";

const TAG = "accounting";
function bust() { revalidateTag(TAG, "max"); }

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type JournalEntry = Database["public"]["Tables"]["journal_entries"]["Row"];
export type JournalLine = Database["public"]["Tables"]["journal_lines"]["Row"];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio",
  ingreso: "Ingreso", gasto: "Gasto",
};

export const listAccounts = unstable_cache(
  async (): Promise<Account[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("accounts").select("*").order("code");
    if (error) throw error;
    return (data ?? []) as Account[];
  },
  ["accounts_all"], { revalidate: 300, tags: [TAG] },
);

export async function createAccount(input: { code: string; name: string; type: AccountType; parent_id?: string | null }) {
  const sb = getSupabase();
  const { error } = await sb.from("accounts").insert(input);
  if (error) throw error;
  bust();
}

export async function updateAccount(id: string, patch: { code?: string; name?: string; type?: AccountType; parent_id?: string | null; active?: boolean }) {
  const sb = getSupabase();
  const { error } = await sb.from("accounts").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteAccount(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("accounts").delete().eq("id", id);
  if (error) throw error;
  bust();
}

// ── Journal entries ───────────────────────────────────────────────────────

export type JournalLineInput = {
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  /**
   * Monto USD congelado de la línea. Si se omite y el asiento trae
   * exchange_rate, se deriva como monto/tasa. Las líneas de ajuste puramente
   * CUP (p. ej. 5310 Diferencia de tasa de inventario) deben mandar 0 explícito.
   */
  debit_usd?: number;
  credit_usd?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Completa los montos USD de las líneas (derivando monto/tasa cuando faltan)
 * y corrige el descuadre de centavos del redondeo absorbiéndolo en la línea
 * USD más grande. Devuelve las líneas listas para insertar.
 */
function resolveUsdLines(lines: JournalLineInput[], exchangeRate?: number | null) {
  const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : null;
  const resolved = lines.map((l) => ({
    ...l,
    debit_usd: l.debit_usd ?? (rate ? round2(Number(l.debit) / rate) : 0),
    credit_usd: l.credit_usd ?? (rate ? round2(Number(l.credit) / rate) : 0),
  }));
  const debitUsd = resolved.reduce((s, l) => s + l.debit_usd, 0);
  const creditUsd = resolved.reduce((s, l) => s + l.credit_usd, 0);
  const diff = round2(debitUsd - creditUsd);
  if (diff !== 0) {
    if (Math.abs(diff) > 0.05) {
      throw new Error(`Asiento desbalanceado en USD: debe ${debitUsd.toFixed(2)} vs haber ${creditUsd.toFixed(2)}.`);
    }
    // Descuadre de redondeo: se absorbe en la línea mayor del lado excedido.
    const side: "debit_usd" | "credit_usd" = diff > 0 ? "debit_usd" : "credit_usd";
    const target = resolved.reduce((m, l) => (l[side] > m[side] ? l : m), resolved[0]);
    target[side] = round2(target[side] - Math.abs(diff));
  }
  return resolved;
}

export type JournalEntrySummary = JournalEntry & { line_count: number };

export const listJournalEntries = unstable_cache(
  async (filter?: { status?: JournalEntryStatus; from?: string; to?: string; scope?: string[]; business?: string }): Promise<JournalEntrySummary[]> => {
    const sb = getSupabase();
    let q = sb.from("journal_entries").select("*, journal_lines(id)").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("entry_date", filter.from);
    if (filter?.to) q = q.lte("entry_date", filter.to);
    // scope: limitar a asientos del/los negocio(s) del usuario.
    if (filter?.scope) q = q.in("business", filter.scope);
    // business: ver el libro de un negocio concreto (selector de reportes).
    if (filter?.business) q = q.eq("business", filter.business);
    const { data, error } = await q;
    if (error) throw error;
    type R = JournalEntry & { journal_lines: { id: string }[] | null };
    return ((data ?? []) as unknown as R[]).map((r) => ({
      ...r,
      total_debit: Number(r.total_debit),
      total_credit: Number(r.total_credit),
      line_count: (r.journal_lines ?? []).length,
    }));
  },
  ["journal_entries_list"], { revalidate: 30, tags: [TAG] },
);

export type JournalEntryDetail = JournalEntry & {
  lines: (JournalLine & { account_code: string; account_name: string })[];
};

export async function getJournalEntry(id: string, scope?: string[]): Promise<JournalEntryDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (scope && (!data.business || !scope.includes(data.business))) return null;
  const { data: rawLines, error: lErr } = await sb
    .from("journal_lines")
    .select("*, accounts!inner(code, name)")
    .eq("entry_id", id)
    .order("position");
  if (lErr) throw lErr;
  type LR = JournalLine & { accounts: { code: string; name: string } | null };
  const lines = ((rawLines ?? []) as unknown as LR[]).map((r) => ({
    ...r,
    debit: Number(r.debit),
    credit: Number(r.credit),
    debit_usd: Number(r.debit_usd ?? 0),
    credit_usd: Number(r.credit_usd ?? 0),
    account_code: r.accounts?.code ?? "",
    account_name: r.accounts?.name ?? "",
  }));
  return {
    ...data,
    total_debit: Number(data.total_debit),
    total_credit: Number(data.total_credit),
    lines,
  };
}

export async function createJournalEntry(input: {
  entry_date: string; description: string; reference_type?: string; reference_id?: string | null;
  business?: string | null;
  created_by: string | null;
  /** Tasa USD→CUP del día del asiento; congela los montos USD de las líneas. */
  exchange_rate?: number | null;
  lines: JournalLineInput[];
}): Promise<string> {
  if (input.lines.length < 2) throw new Error("Un asiento requiere al menos dos líneas.");
  const totalDebit = input.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = input.lines.reduce((s, l) => s + Number(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Asiento desbalanceado: debe ${totalDebit.toFixed(2)} vs haber ${totalCredit.toFixed(2)}.`);
  }
  const lines = resolveUsdLines(input.lines, input.exchange_rate);
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries").insert({
    entry_date: input.entry_date,
    description: input.description,
    reference_type: input.reference_type ?? "manual",
    reference_id: input.reference_id ?? null,
    business: input.business ?? null,
    exchange_rate: input.exchange_rate ?? null,
    created_by: input.created_by,
  }).select("id").single();
  if (error) throw error;

  const payload = lines.map((l, i) => ({
    entry_id: data.id, account_id: l.account_id,
    debit: l.debit, credit: l.credit,
    debit_usd: l.debit_usd, credit_usd: l.credit_usd,
    description: l.description, position: i,
  }));
  const { error: lErr } = await sb.from("journal_lines").insert(payload);
  if (lErr) {
    await sb.from("journal_entries").delete().eq("id", data.id);
    throw lErr;
  }
  bust();
  return data.id;
}

export async function replaceJournalLines(id: string, lines: JournalLineInput[], exchangeRate?: number | null) {
  if (lines.length < 2) throw new Error("Un asiento requiere al menos dos líneas.");
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Asiento desbalanceado: debe ${totalDebit.toFixed(2)} vs haber ${totalCredit.toFixed(2)}.`);
  }
  const resolved = resolveUsdLines(lines, exchangeRate);
  const sb = getSupabase();
  const { error: dErr } = await sb.from("journal_lines").delete().eq("entry_id", id);
  if (dErr) throw dErr;
  const payload = resolved.map((l, i) => ({
    entry_id: id, account_id: l.account_id,
    debit: l.debit, credit: l.credit,
    debit_usd: l.debit_usd, credit_usd: l.credit_usd,
    description: l.description, position: i,
  }));
  const { error } = await sb.from("journal_lines").insert(payload);
  if (error) throw error;
  if (exchangeRate !== undefined) {
    await sb.from("journal_entries").update({ exchange_rate: exchangeRate }).eq("id", id);
  }
  bust();
}

export async function updateJournalEntryHeader(id: string, patch: { entry_date?: string; description?: string }) {
  const sb = getSupabase();
  const { error } = await sb.from("journal_entries").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function postJournalEntry(id: string, userId: string | null) {
  const sb = getSupabase();
  const e = await getJournalEntry(id);
  if (!e) throw new Error("Asiento no encontrado.");
  if (e.status !== "borrador") throw new Error("Solo se pueden contabilizar borradores.");
  if (Math.abs(Number(e.total_debit) - Number(e.total_credit)) > 0.005) {
    throw new Error("El asiento está desbalanceado.");
  }
  const { error } = await sb.from("journal_entries").update({
    status: "contabilizada", posted_by: userId, posted_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
  bust();
}

export async function deleteJournalEntry(id: string) {
  const sb = getSupabase();
  const e = await getJournalEntry(id);
  if (!e) return;
  if (e.status === "contabilizada") throw new Error("No se puede eliminar un asiento contabilizado.");
  const { error } = await sb.from("journal_entries").delete().eq("id", id);
  if (error) throw error;
  bust();
}

/**
 * Borra todos los asientos generados para una referencia (p.ej. la comisión de
 * un cuadre). Lanza si alguno está contabilizado (hay que reversarlo a mano
 * primero), dejando el resto intacto. Para reabrir cierres/repartos.
 */
export async function deleteEntriesByReference(referenceType: string, referenceId: string): Promise<void> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("journal_entries")
    .select("id")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId);
  if (error) throw error;
  for (const e of data ?? []) await deleteJournalEntry(e.id);
}

// ── Trial balance ────────────────────────────────────────────────────────

export type TrialBalanceRow = {
  account_id: string; account_code: string; account_name: string; type: AccountType;
  /** Moneda nativa de la cuenta; el balance CUP queda en esta moneda (sin convertir). */
  currency: DeliveryCurrency;
  debit: number; credit: number; balance: number;
  /** Cifras USD CONGELADAS a la tasa del día de cada asiento (moneda rectora). */
  debit_usd: number; credit_usd: number; balance_usd: number;
};

export async function trialBalance(opts?: { from?: string; to?: string; postedOnly?: boolean; scope?: string[]; business?: string }): Promise<TrialBalanceRow[]> {
  const sb = getSupabase();
  let q = sb.from("journal_lines")
    .select("debit,credit,debit_usd,credit_usd,account_id,journal_entries!inner(entry_date,status,business), accounts!inner(code,name,type,currency)");
  if (opts?.postedOnly) q = q.eq("journal_entries.status", "contabilizada");
  if (opts?.from) q = q.gte("journal_entries.entry_date", opts.from);
  if (opts?.to) q = q.lte("journal_entries.entry_date", opts.to);
  if (opts?.scope) q = q.in("journal_entries.business", opts.scope);
  if (opts?.business) q = q.eq("journal_entries.business", opts.business);
  const { data, error } = await q;
  if (error) throw error;
  type Row = {
    debit: number; credit: number; debit_usd: number | null; credit_usd: number | null; account_id: string;
    journal_entries: { entry_date: string; status: JournalEntryStatus } | null;
    accounts: { code: string; name: string; type: AccountType; currency: DeliveryCurrency } | null;
  };
  const agg = new Map<string, TrialBalanceRow>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.accounts) continue;
    const cur = agg.get(r.account_id) ?? {
      account_id: r.account_id,
      account_code: r.accounts.code,
      account_name: r.accounts.name,
      type: r.accounts.type,
      currency: r.accounts.currency ?? "CUP",
      debit: 0, credit: 0, balance: 0,
      debit_usd: 0, credit_usd: 0, balance_usd: 0,
    };
    cur.debit += Number(r.debit);
    cur.credit += Number(r.credit);
    cur.debit_usd += Number(r.debit_usd ?? 0);
    cur.credit_usd += Number(r.credit_usd ?? 0);
    agg.set(r.account_id, cur);
  }
  // Saldo según tipo: activos y gastos = debit - credit; resto = credit - debit
  for (const row of agg.values()) {
    if (row.type === "activo" || row.type === "gasto") {
      row.balance = row.debit - row.credit;
      row.balance_usd = row.debit_usd - row.credit_usd;
    } else {
      row.balance = row.credit - row.debit;
      row.balance_usd = row.credit_usd - row.debit_usd;
    }
  }
  return Array.from(agg.values()).sort((a, b) => a.account_code.localeCompare(b.account_code));
}

// ── Estado de resultados (P&L) ───────────────────────────────────────────────

export type IncomeStatement = {
  income: TrialBalanceRow[];
  expense: TrialBalanceRow[];
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  /** Cifras USD reales (congeladas por transacción) — la utilidad que importa. */
  totalIncomeUsd: number;
  totalExpenseUsd: number;
  netIncomeUsd: number;
};

/**
 * Estado de resultados por negocio (o consolidado). Reutiliza la agregación de
 * `trialBalance` y separa ingresos de gastos; utilidad neta = ingresos − gastos.
 * Las cifras USD salen de los montos congelados por asiento; la cuenta 5310
 * (diferencia de tasa de inventario) no las contamina porque sus líneas llevan
 * USD = 0 por construcción.
 */
export async function incomeStatement(opts?: { from?: string; to?: string; postedOnly?: boolean; scope?: string[]; business?: string }): Promise<IncomeStatement> {
  const rows = await trialBalance(opts);
  const income = rows.filter((r) => r.type === "ingreso");
  const expense = rows.filter((r) => r.type === "gasto");
  const totalIncome = income.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expense.reduce((s, r) => s + r.balance, 0);
  const totalIncomeUsd = income.reduce((s, r) => s + r.balance_usd, 0);
  const totalExpenseUsd = expense.reduce((s, r) => s + r.balance_usd, 0);
  return {
    income, expense, totalIncome, totalExpense, netIncome: totalIncome - totalExpense,
    totalIncomeUsd, totalExpenseUsd, netIncomeUsd: totalIncomeUsd - totalExpenseUsd,
  };
}

export const JOURNAL_STATUS_LABEL: Record<JournalEntryStatus, string> = {
  borrador: "Borrador",
  contabilizada: "Contabilizada",
};

export const JOURNAL_STATUS_BADGE: Record<JournalEntryStatus, string> = {
  borrador: "bg-muted text-muted-foreground",
  contabilizada: "bg-success/10 text-success",
};
