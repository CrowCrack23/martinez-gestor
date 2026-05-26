import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import type { Database, AccountType, JournalEntryStatus } from "./supabase-types";

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

export type JournalLineInput = { account_id: string; debit: number; credit: number; description: string };

export type JournalEntrySummary = JournalEntry & { line_count: number };

export const listJournalEntries = unstable_cache(
  async (filter?: { status?: JournalEntryStatus; from?: string; to?: string }): Promise<JournalEntrySummary[]> => {
    const sb = getSupabase();
    let q = sb.from("journal_entries").select("*, journal_lines(id)").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.from) q = q.gte("entry_date", filter.from);
    if (filter?.to) q = q.lte("entry_date", filter.to);
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

export async function getJournalEntry(id: string): Promise<JournalEntryDetail | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
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
  created_by: string | null;
  lines: JournalLineInput[];
}): Promise<string> {
  if (input.lines.length < 2) throw new Error("Un asiento requiere al menos dos líneas.");
  const totalDebit = input.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = input.lines.reduce((s, l) => s + Number(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Asiento desbalanceado: debe ${totalDebit.toFixed(2)} vs haber ${totalCredit.toFixed(2)}.`);
  }
  const sb = getSupabase();
  const { data, error } = await sb.from("journal_entries").insert({
    entry_date: input.entry_date,
    description: input.description,
    reference_type: input.reference_type ?? "manual",
    reference_id: input.reference_id ?? null,
    created_by: input.created_by,
  }).select("id").single();
  if (error) throw error;

  const payload = input.lines.map((l, i) => ({
    entry_id: data.id, account_id: l.account_id,
    debit: l.debit, credit: l.credit, description: l.description, position: i,
  }));
  const { error: lErr } = await sb.from("journal_lines").insert(payload);
  if (lErr) {
    await sb.from("journal_entries").delete().eq("id", data.id);
    throw lErr;
  }
  bust();
  return data.id;
}

export async function replaceJournalLines(id: string, lines: JournalLineInput[]) {
  if (lines.length < 2) throw new Error("Un asiento requiere al menos dos líneas.");
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Asiento desbalanceado: debe ${totalDebit.toFixed(2)} vs haber ${totalCredit.toFixed(2)}.`);
  }
  const sb = getSupabase();
  const { error: dErr } = await sb.from("journal_lines").delete().eq("entry_id", id);
  if (dErr) throw dErr;
  const payload = lines.map((l, i) => ({
    entry_id: id, account_id: l.account_id,
    debit: l.debit, credit: l.credit, description: l.description, position: i,
  }));
  const { error } = await sb.from("journal_lines").insert(payload);
  if (error) throw error;
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

// ── Trial balance ────────────────────────────────────────────────────────

export type TrialBalanceRow = {
  account_id: string; account_code: string; account_name: string; type: AccountType;
  debit: number; credit: number; balance: number;
};

export async function trialBalance(opts?: { from?: string; to?: string; postedOnly?: boolean }): Promise<TrialBalanceRow[]> {
  const sb = getSupabase();
  let q = sb.from("journal_lines")
    .select("debit,credit,account_id,journal_entries!inner(entry_date,status), accounts!inner(code,name,type)");
  if (opts?.postedOnly) q = q.eq("journal_entries.status", "contabilizada");
  if (opts?.from) q = q.gte("journal_entries.entry_date", opts.from);
  if (opts?.to) q = q.lte("journal_entries.entry_date", opts.to);
  const { data, error } = await q;
  if (error) throw error;
  type Row = {
    debit: number; credit: number; account_id: string;
    journal_entries: { entry_date: string; status: JournalEntryStatus } | null;
    accounts: { code: string; name: string; type: AccountType } | null;
  };
  const agg = new Map<string, TrialBalanceRow>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.accounts) continue;
    const cur = agg.get(r.account_id) ?? {
      account_id: r.account_id,
      account_code: r.accounts.code,
      account_name: r.accounts.name,
      type: r.accounts.type,
      debit: 0, credit: 0, balance: 0,
    };
    cur.debit += Number(r.debit);
    cur.credit += Number(r.credit);
    agg.set(r.account_id, cur);
  }
  // Saldo según tipo: activos y gastos = debit - credit; resto = credit - debit
  for (const row of agg.values()) {
    if (row.type === "activo" || row.type === "gasto") {
      row.balance = row.debit - row.credit;
    } else {
      row.balance = row.credit - row.debit;
    }
  }
  return Array.from(agg.values()).sort((a, b) => a.account_code.localeCompare(b.account_code));
}

export const JOURNAL_STATUS_LABEL: Record<JournalEntryStatus, string> = {
  borrador: "Borrador",
  contabilizada: "Contabilizada",
};

export const JOURNAL_STATUS_BADGE: Record<JournalEntryStatus, string> = {
  borrador: "bg-muted text-muted-foreground",
  contabilizada: "bg-success/10 text-success",
};
