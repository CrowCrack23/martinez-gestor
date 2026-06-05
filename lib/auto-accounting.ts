import "server-only";
import { getSupabase } from "./supabase";
import { createJournalEntry, type JournalLineInput } from "./accounting";
import { movementCost } from "./costing";
import type { PaymentMethod, OrderOrigin } from "./supabase-types";

// Generación automática de asientos contables (en borrador) a partir de los
// eventos de negocio: recepción de compra, confirmación de venta, cierre de
// nómina y entrega de remesa. El contador los revisa y contabiliza desde
// /contabilidad/asientos.
//
// Diseño:
//  - Idempotente: si ya existe un asiento para ese (reference_type, reference_id)
//    no se crea otro.
//  - Best-effort: un fallo aquí (p.ej. falta una cuenta del plan) se registra en
//    consola pero NO revierte la operación de negocio. Los asientos son borradores
//    revisables; es preferible no bloquear una recepción/venta por contabilidad.
//  - Mapeo de cuentas por código (ver plan en migración 0011).

// Códigos del plan de cuentas (0011_accounting.sql)
const ACC = {
  cajaCup: "1110",
  cajaUsd: "1120",
  banco: "1130",
  cxc: "1200",
  inventario: "1300",
  cxp: "2100",
  impuestos: "2200",
  salariosPorPagar: "2300",
  ventasOnline: "4100",
  ventasTienda: "4200",
  comisionesRemesas: "4300",
  diferenciaTasas: "4310",
  costoVentas: "5100",
  salarios: "5200",
  comisionesVenta: "5250",
  pagoMensajeros: "5260",
} as const;

async function accountIdsByCode(codes: string[]): Promise<Map<string, string>> {
  const sb = getSupabase();
  const { data, error } = await sb.from("accounts").select("id, code").in("code", codes);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const a of data ?? []) map.set(a.code, a.id);
  for (const c of codes) {
    if (!map.has(c)) throw new Error(`Falta la cuenta contable con código ${c} en el plan de cuentas.`);
  }
  return map;
}

async function entryExists(referenceType: string, referenceId: string): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("journal_entries")
    .select("id")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cuenta de cobro según método de pago. */
function debitAccountForPayment(method: PaymentMethod): keyof typeof ACC {
  switch (method) {
    case "efectivo":
      return "cajaCup";
    case "transferencia":
    case "tarjeta":
      return "banco";
    case "mixto":
      return "cajaCup";
    default:
      return "cxc";
  }
}

/** Cuenta de ingreso según origen de la venta. */
function revenueAccountForOrigin(origin: OrderOrigin): keyof typeof ACC {
  return origin === "online" ? "ventasOnline" : "ventasTienda";
}

// ── Generadores ─────────────────────────────────────────────────────────────

/** Compra recibida: Inventario (debe) / Cuentas por pagar (haber). */
export async function generatePurchaseEntry(input: {
  purchaseId: string;
  code: string;
  supplierName: string;
  total: number;
  business: string | null;
  date: string;
  userId: string | null;
}): Promise<void> {
  try {
    if (input.total <= 0) return;
    if (await entryExists("compra", input.purchaseId)) return;
    const acc = await accountIdsByCode([ACC.inventario, ACC.cxp]);
    const total = round2(input.total);
    const lines: JournalLineInput[] = [
      { account_id: acc.get(ACC.inventario)!, debit: total, credit: 0, description: "Inventario recibido" },
      { account_id: acc.get(ACC.cxp)!, debit: 0, credit: total, description: `Por pagar a ${input.supplierName}` },
    ];
    await createJournalEntry({
      entry_date: input.date,
      description: `Compra ${input.code} — ${input.supplierName}`,
      reference_type: "compra",
      reference_id: input.purchaseId,
      business: input.business,
      created_by: input.userId,
      lines,
    });
  } catch (e) {
    console.error("[auto-accounting] generatePurchaseEntry falló:", e);
  }
}

/**
 * Venta confirmada:
 *   Caja|Banco|CxC (debe) / Ventas (haber)  — por el ingreso
 *   Costo de ventas (debe) / Inventario (haber)  — por el COGS (si > 0)
 */
export async function generateSaleEntry(input: {
  orderId: string;
  code: string;
  customerName: string | null;
  total: number;
  paymentMethod: PaymentMethod;
  origin: OrderOrigin;
  movementId: string | null;
  business: string | null;
  date: string;
  userId: string | null;
}): Promise<void> {
  try {
    if (input.total <= 0) return;
    if (await entryExists("venta", input.orderId)) return;

    const cogs = input.movementId ? round2(await movementCost(input.movementId)) : 0;
    const debitCode = ACC[debitAccountForPayment(input.paymentMethod)];
    const revenueCode = ACC[revenueAccountForOrigin(input.origin)];
    const needed = [debitCode, revenueCode];
    if (cogs > 0) needed.push(ACC.costoVentas, ACC.inventario);
    const acc = await accountIdsByCode(needed);

    const total = round2(input.total);
    const who = input.customerName ? ` — ${input.customerName}` : "";
    const lines: JournalLineInput[] = [
      { account_id: acc.get(debitCode)!, debit: total, credit: 0, description: `Cobro venta ${input.code}` },
      { account_id: acc.get(revenueCode)!, debit: 0, credit: total, description: `Venta ${input.code}` },
    ];
    if (cogs > 0) {
      lines.push(
        { account_id: acc.get(ACC.costoVentas)!, debit: cogs, credit: 0, description: "Costo de ventas" },
        { account_id: acc.get(ACC.inventario)!, debit: 0, credit: cogs, description: "Salida de inventario" },
      );
    }
    await createJournalEntry({
      entry_date: input.date,
      description: `Venta ${input.code}${who}`,
      reference_type: "venta",
      reference_id: input.orderId,
      business: input.business,
      created_by: input.userId,
      lines,
    });
  } catch (e) {
    console.error("[auto-accounting] generateSaleEntry falló:", e);
  }
}

/**
 * Nómina cerrada: un asiento POR NEGOCIO (libros separados). Cada grupo es el
 * total de los empleados de un negocio; los empleados sin negocio van a "general"
 * (business = null).
 *   Salarios (debe, bruto) / Salarios por pagar (haber, neto) + Impuestos por pagar (haber, deducciones)
 */
export async function generatePayrollEntry(input: {
  runId: string;
  periodStart: string;
  periodEnd: string;
  date: string;
  userId: string | null;
  groups: { business: string | null; gross: number; deductions: number; net: number }[];
}): Promise<void> {
  try {
    const acc = await accountIdsByCode([ACC.salarios, ACC.salariosPorPagar, ACC.impuestos]);
    for (const g of input.groups) {
      const gross = round2(g.gross);
      if (gross <= 0) continue;
      // Idempotencia por (corrida, negocio).
      const refId = `${input.runId}:${g.business ?? "general"}`;
      if (await entryExists("nomina", refId)) continue;
      const net = round2(g.net);
      const deductions = round2(g.deductions);
      const lines: JournalLineInput[] = [
        { account_id: acc.get(ACC.salarios)!, debit: gross, credit: 0, description: "Gasto de salarios" },
        { account_id: acc.get(ACC.salariosPorPagar)!, debit: 0, credit: net, description: "Salarios netos por pagar" },
      ];
      if (deductions > 0) {
        lines.push({ account_id: acc.get(ACC.impuestos)!, debit: 0, credit: deductions, description: "Deducciones por pagar" });
      }
      await createJournalEntry({
        entry_date: input.date,
        description: `Nómina ${input.periodStart} a ${input.periodEnd}`,
        reference_type: "nomina",
        reference_id: refId,
        business: g.business,
        created_by: input.userId,
        lines,
      });
    }
  } catch (e) {
    console.error("[auto-accounting] generatePayrollEntry falló:", e);
  }
}

/**
 * Cuadre diario confirmado: comisión del trabajador del punto de venta
 * (% sobre la ganancia del día, ver lib/closures.ts).
 *   Comisiones de venta (debe) / Caja CUP (haber)
 */
export async function generateCommissionEntry(input: {
  closureId: string;
  warehouseName: string;
  day: string;
  commissionCup: number;
  business: string | null;
  userId: string | null;
}): Promise<void> {
  try {
    const commission = round2(input.commissionCup);
    if (commission <= 0) return;
    if (await entryExists("cuadre", input.closureId)) return;
    const acc = await accountIdsByCode([ACC.comisionesVenta, ACC.cajaCup]);
    const lines: JournalLineInput[] = [
      { account_id: acc.get(ACC.comisionesVenta)!, debit: commission, credit: 0, description: "Comisión del vendedor" },
      { account_id: acc.get(ACC.cajaCup)!, debit: 0, credit: commission, description: "Pago de comisión" },
    ];
    await createJournalEntry({
      entry_date: input.day,
      description: `Comisión cuadre ${input.day} — ${input.warehouseName}`,
      reference_type: "cuadre",
      reference_id: input.closureId,
      business: input.business,
      created_by: input.userId,
      lines,
    });
  } catch (e) {
    console.error("[auto-accounting] generateCommissionEntry falló:", e);
  }
}

/**
 * Remesa entregada: ganancia = comisión + diferencia de tasas, en el negocio
 * del origen (remesas_eeuu | remesas_europa, migración 0033).
 *   Caja CUP (debe, ganancia total) / Comisiones remesas 4300 (haber)
 *                                   / Diferencia de tasas 4310 (haber, si hay spread)
 * Un spread negativo (se entregó más caro) va al DEBE de 4310 como pérdida por
 * tasa, manteniendo el asiento balanceado. El movimiento del principal
 * (USD/EUR recibido ↔ entregado) es un pase neto que no se asienta.
 */
export async function generateRemittanceEntry(input: {
  remittanceId: string;
  code: string;
  origin: "eeuu" | "europa";
  commissionCup: number;
  spreadCup: number;
  date: string;
  userId: string | null;
}): Promise<void> {
  try {
    const commission = round2(input.commissionCup);
    const spread = round2(input.spreadCup);
    const profit = round2(commission + spread);
    if (profit <= 0 && commission <= 0) return;
    if (await entryExists("remesa", input.remittanceId)) return;
    // Mismo mapeo que remittanceBusiness (lib/remittances.ts); duplicado aquí
    // para no crear un import circular remittances ↔ auto-accounting.
    const business = input.origin === "europa" ? "remesas_europa" : "remesas_eeuu";
    const needed: string[] = [ACC.cajaCup, ACC.comisionesRemesas];
    if (spread !== 0) needed.push(ACC.diferenciaTasas);
    const acc = await accountIdsByCode(needed);
    const lines: JournalLineInput[] = [
      { account_id: acc.get(ACC.cajaCup)!, debit: profit, credit: 0, description: `Ganancia remesa ${input.code}` },
      { account_id: acc.get(ACC.comisionesRemesas)!, debit: 0, credit: commission, description: `Comisión remesa ${input.code}` },
    ];
    if (spread > 0) {
      lines.push({ account_id: acc.get(ACC.diferenciaTasas)!, debit: 0, credit: spread, description: "Diferencia de tasas" });
    } else if (spread < 0) {
      lines.push({ account_id: acc.get(ACC.diferenciaTasas)!, debit: -spread, credit: 0, description: "Pérdida por tasa" });
    }
    await createJournalEntry({
      entry_date: input.date,
      description: `Remesa ${input.code} entregada`,
      reference_type: "remesa",
      reference_id: input.remittanceId,
      business,
      created_by: input.userId,
      lines,
    });
  } catch (e) {
    console.error("[auto-accounting] generateRemittanceEntry falló:", e);
  }
}

/**
 * Cuadre semanal de remesas confirmado: pago agregado a los mensajeros de la
 * semana (Σ courier_fee_cup de las remesas entregadas).
 *   Pago a mensajeros 5260 (debe) / Caja CUP (haber)
 */
export async function generateCourierPayEntry(input: {
  closureId: string;
  business: string;
  weekStart: string;
  amountCup: number;
  userId: string | null;
}): Promise<void> {
  try {
    const amount = round2(input.amountCup);
    if (amount <= 0) return;
    if (await entryExists("cuadre_remesas", input.closureId)) return;
    const acc = await accountIdsByCode([ACC.pagoMensajeros, ACC.cajaCup]);
    const lines: JournalLineInput[] = [
      { account_id: acc.get(ACC.pagoMensajeros)!, debit: amount, credit: 0, description: "Pago a mensajeros de la semana" },
      { account_id: acc.get(ACC.cajaCup)!, debit: 0, credit: amount, description: "Pago de mensajería" },
    ];
    await createJournalEntry({
      entry_date: input.weekStart,
      description: `Pago mensajeros semana ${input.weekStart}`,
      reference_type: "cuadre_remesas",
      reference_id: input.closureId,
      business: input.business,
      created_by: input.userId,
      lines,
    });
  } catch (e) {
    console.error("[auto-accounting] generateCourierPayEntry falló:", e);
  }
}
