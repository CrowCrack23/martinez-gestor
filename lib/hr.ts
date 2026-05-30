import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import { generatePayrollEntry } from "./auto-accounting";
import type { Database, PayrollStatus } from "./supabase-types";

const TAG_POS = "positions";
const TAG_EMP = "employees";
const TAG_ATT = "attendance";
const TAG_PAY = "payroll";

function bust(tag: string) { revalidateTag(tag, "max"); }

// ── Positions ─────────────────────────────────────────────────────────────

export type Position = Database["public"]["Tables"]["positions"]["Row"];

export const listPositions = unstable_cache(
  async (): Promise<Position[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("positions").select("*")
      .order("active", { ascending: false }).order("name");
    if (error) throw error;
    return data ?? [];
  },
  ["positions_all"], { revalidate: 120, tags: [TAG_POS] },
);

export async function createPosition(input: { name: string; description?: string; base_salary?: number }) {
  const sb = getSupabase();
  const { error } = await sb.from("positions").insert(input);
  if (error) throw error;
  bust(TAG_POS);
}

export async function updatePosition(id: string, patch: Partial<{ name: string; description: string; base_salary: number; active: boolean }>) {
  const sb = getSupabase();
  const { error } = await sb.from("positions").update(patch).eq("id", id);
  if (error) throw error;
  bust(TAG_POS);
}

export async function deletePosition(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("positions").delete().eq("id", id);
  if (error) throw error;
  bust(TAG_POS);
}

// ── Employees ─────────────────────────────────────────────────────────────

export type Employee = Database["public"]["Tables"]["employees"]["Row"];

export type EmployeeWithRefs = Employee & {
  position_name: string | null;
  warehouse_name: string | null;
};

type EmpJoinRow = Employee & {
  positions: { name: string } | null;
  warehouses: { name: string } | null;
};

export const listEmployees = unstable_cache(
  async (): Promise<EmployeeWithRefs[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("employees")
      .select("*, positions(name), warehouses(name)")
      .order("active", { ascending: false }).order("first_name");
    if (error) throw error;
    return ((data ?? []) as unknown as EmpJoinRow[]).map((e) => ({
      ...e,
      position_name: e.positions?.name ?? null,
      warehouse_name: e.warehouses?.name ?? null,
    }));
  },
  ["employees_all"], { revalidate: 60, tags: [TAG_EMP] },
);

export async function getEmployee(id: string): Promise<Employee | null> {
  const sb = getSupabase();
  const { data, error } = await sb.from("employees").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function createEmployee(input: Database["public"]["Tables"]["employees"]["Insert"]) {
  const sb = getSupabase();
  const { data, error } = await sb.from("employees").insert(input).select("id").single();
  if (error) throw error;
  bust(TAG_EMP);
  return data.id;
}

export async function updateEmployee(id: string, patch: Database["public"]["Tables"]["employees"]["Update"]) {
  const sb = getSupabase();
  const { error } = await sb.from("employees").update(patch).eq("id", id);
  if (error) throw error;
  bust(TAG_EMP);
}

export async function deleteEmployee(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from("employees").delete().eq("id", id);
  if (error) throw error;
  bust(TAG_EMP);
}

// ── Attendance ────────────────────────────────────────────────────────────

export type AttendanceRow = Database["public"]["Tables"]["attendance"]["Row"];

export async function listAttendance(day: string): Promise<AttendanceRow[]> {
  const sb = getSupabase();
  const { data, error } = await sb.from("attendance").select("*").eq("day", day);
  if (error) throw error;
  return data ?? [];
}

export async function upsertAttendance(rows: {
  employee_id: string; day: string; present: boolean; hours: number; notes?: string; recorded_by?: string | null;
}[]) {
  if (rows.length === 0) return;
  const sb = getSupabase();
  const { error } = await sb.from("attendance").upsert(rows, { onConflict: "employee_id,day" });
  if (error) throw error;
  bust(TAG_ATT);
}

// ── Payroll ──────────────────────────────────────────────────────────────

export type PayrollRun = Database["public"]["Tables"]["payroll_runs"]["Row"];
export type PayrollItem = Database["public"]["Tables"]["payroll_items"]["Row"];

export const listPayrollRuns = unstable_cache(
  async (): Promise<PayrollRun[]> => {
    const sb = getSupabase();
    const { data, error } = await sb.from("payroll_runs").select("*")
      .order("period_start", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  ["payroll_runs_all"], { revalidate: 60, tags: [TAG_PAY] },
);

export async function getPayrollRun(id: string): Promise<{ run: PayrollRun; items: (PayrollItem & { employee_name: string })[] } | null> {
  const sb = getSupabase();
  const { data: run, error } = await sb.from("payroll_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!run) return null;
  const { data: items, error: iErr } = await sb
    .from("payroll_items")
    .select("*, employees!inner(first_name,last_name,code)")
    .eq("payroll_run_id", id);
  if (iErr) throw iErr;
  type ItemRaw = PayrollItem & { employees: { first_name: string; last_name: string; code: string } | null };
  const enriched = ((items ?? []) as unknown as ItemRaw[]).map((it) => ({
    ...it,
    employee_name: it.employees ? `${it.employees.first_name} ${it.employees.last_name}`.trim() : "",
  }));
  enriched.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  return { run, items: enriched };
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

/**
 * Crea un período de nómina y precalcula líneas para todos los empleados activos.
 * Para cada uno: days_worked = días presentes en attendance dentro del rango;
 * gross = salario_mensual * (days_worked / days_in_period); net = gross.
 * El usuario puede ajustar deducciones/notas antes de cerrar.
 */
export async function createPayrollRun(input: {
  period_start: string; period_end: string; notes: string; created_by: string | null;
}): Promise<string> {
  const sb = getSupabase();
  const { data: run, error } = await sb.from("payroll_runs")
    .insert({ period_start: input.period_start, period_end: input.period_end, notes: input.notes, created_by: input.created_by })
    .select("id").single();
  if (error) throw error;

  const { data: emps, error: eErr } = await sb.from("employees")
    .select("id,monthly_salary,commission_rate,app_user_id").eq("active", true);
  if (eErr) throw eErr;
  if (!emps || emps.length === 0) { bust(TAG_PAY); return run.id; }

  const { data: att, error: aErr } = await sb
    .from("attendance").select("employee_id,present,hours")
    .gte("day", input.period_start).lte("day", input.period_end);
  if (aErr) throw aErr;

  const presentByEmp = new Map<string, number>();
  for (const a of att ?? []) {
    if (a.present) {
      presentByEmp.set(a.employee_id, (presentByEmp.get(a.employee_id) ?? 0) + 1);
    }
  }

  // Comisión: ventas confirmadas por el usuario del empleado dentro del período.
  // Solo se consulta si algún empleado tiene comisión y usuario enlazado.
  const salesByUser = new Map<string, number>();
  const anyCommission = emps.some((e) => Number(e.commission_rate) > 0 && e.app_user_id);
  if (anyCommission) {
    const endExclusive = new Date(input.period_end + "T00:00:00Z");
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const { data: orders, error: oErr } = await sb
      .from("orders")
      .select("total_amount,confirmed_by,confirmed_at")
      .eq("status", "confirmada")
      .gte("confirmed_at", input.period_start)
      .lt("confirmed_at", endExclusive.toISOString());
    if (oErr) throw oErr;
    for (const o of orders ?? []) {
      if (!o.confirmed_by) continue;
      salesByUser.set(o.confirmed_by, (salesByUser.get(o.confirmed_by) ?? 0) + Number(o.total_amount));
    }
  }

  const total = daysBetween(input.period_start, input.period_end);
  const items = emps.map((e) => {
    const worked = presentByEmp.get(e.id) ?? 0;
    const base = Number(e.monthly_salary);
    // Si no hay registros de asistencia, asumir que trabajó todo el período
    const effective = att && att.length > 0 ? worked : total;
    const baseProrated = Math.round(base * (effective / total) * 100) / 100;
    const rate = Number(e.commission_rate);
    const salesBase = e.app_user_id ? salesByUser.get(e.app_user_id) ?? 0 : 0;
    const commission = rate > 0 ? Math.round(salesBase * (rate / 100) * 100) / 100 : 0;
    const gross = Math.round((baseProrated + commission) * 100) / 100;
    return {
      payroll_run_id: run.id,
      employee_id: e.id,
      base_salary: baseProrated,
      days_worked: effective,
      days_in_period: total,
      sales_base: salesBase,
      commission,
      gross,
      deductions: 0,
      net: gross,
      notes: att && att.length > 0 ? "" : "Sin registros de asistencia; se asumieron todos los días.",
    };
  });
  const { error: insErr } = await sb.from("payroll_items").insert(items);
  if (insErr) {
    await sb.from("payroll_runs").delete().eq("id", run.id);
    throw insErr;
  }
  bust(TAG_PAY);
  return run.id;
}

export async function updatePayrollItem(
  itemId: string,
  patch: { days_worked?: number; gross?: number; deductions?: number; notes?: string },
) {
  const sb = getSupabase();
  // Recalcular net si llegan gross/deductions
  const update: Database["public"]["Tables"]["payroll_items"]["Update"] = { ...patch };
  if (patch.gross !== undefined || patch.deductions !== undefined) {
    const { data: cur } = await sb.from("payroll_items").select("gross,deductions").eq("id", itemId).single();
    const g = patch.gross ?? Number(cur?.gross ?? 0);
    const d = patch.deductions ?? Number(cur?.deductions ?? 0);
    update.net = Math.max(0, Math.round((g - d) * 100) / 100);
  }
  const { error } = await sb.from("payroll_items").update(update).eq("id", itemId);
  if (error) throw error;
  bust(TAG_PAY);
}

export async function closePayrollRun(id: string, userId: string | null) {
  const sb = getSupabase();
  const { data: run, error: rErr } = await sb.from("payroll_runs")
    .select("status, period_start, period_end").eq("id", id).maybeSingle();
  if (rErr) throw rErr;
  if (!run) throw new Error("Nómina no encontrada.");
  if (run.status === "cerrada") throw new Error("La nómina ya está cerrada.");

  const { error } = await sb.from("payroll_runs")
    .update({ status: "cerrada", closed_by: userId, closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  // Asiento contable automático (borrador) POR NEGOCIO del empleado (libros
  // separados): Salarios / Salarios por pagar + Impuestos por pagar.
  const { data: items, error: iErr } = await sb.from("payroll_items")
    .select("gross, deductions, net, employees(business)").eq("payroll_run_id", id);
  if (iErr) throw iErr;
  type Row = { gross: number; deductions: number; net: number; employees: { business: string | null } | null };
  const byBusiness = new Map<string | null, { business: string | null; gross: number; deductions: number; net: number }>();
  for (const it of (items ?? []) as unknown as Row[]) {
    const b = it.employees?.business ?? null;
    const cur = byBusiness.get(b) ?? { business: b, gross: 0, deductions: 0, net: 0 };
    cur.gross += Number(it.gross);
    cur.deductions += Number(it.deductions);
    cur.net += Number(it.net);
    byBusiness.set(b, cur);
  }
  await generatePayrollEntry({
    runId: id,
    periodStart: run.period_start,
    periodEnd: run.period_end,
    date: new Date().toISOString().slice(0, 10),
    userId,
    groups: Array.from(byBusiness.values()),
  });
  bust(TAG_PAY);
}

export async function deletePayrollRun(id: string) {
  const sb = getSupabase();
  const { data: r } = await sb.from("payroll_runs").select("status").eq("id", id).single();
  if (r?.status === "cerrada") throw new Error("No se puede eliminar una nómina cerrada.");
  const { error } = await sb.from("payroll_runs").delete().eq("id", id);
  if (error) throw error;
  bust(TAG_PAY);
}

export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = {
  borrador: "Borrador",
  cerrada: "Cerrada",
};
