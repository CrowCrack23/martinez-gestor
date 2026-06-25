import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";
import type { DeliveryCurrency } from "./supabase-types";

// USD como moneda funcional (moneda rectora): cada transacción congela su
// monto USD a la tasa del día en que ocurre (ver migración 0040). Estos
// helpers dan la tasa del día y la regla de frescura: la tasa se registra a
// mano cada día en /remesas/tasas; con más de RATE_STALE_DAYS días las
// operaciones de compra/venta se bloquean (espejo de current_usd_rate_strict
// en SQL, migración 0041).
//
// Consulta exchange_rates directo (no importa lib/remittances.ts) para no
// crear ciclos de import; reutiliza el tag "exchange_rates" que ya invalida
// upsertExchangeRate.

export type Currency = DeliveryCurrency;

export type Rates = { USD: number | null; EUR: number | null };

/** Días de antigüedad máxima de la tasa antes de bloquear operaciones. */
export const RATE_STALE_DAYS = 3;

export type CurrentRate = {
  rate: number;
  /** Día de la tasa (YYYY-MM-DD). */
  day: string;
  /** Días transcurridos desde la tasa. */
  ageDays: number;
  /** true si supera RATE_STALE_DAYS → operaciones bloqueadas. */
  stale: boolean;
};

/** Última tasa USD→CUP con su fecha y frescura, o null si nunca se registró. */
export const getCurrentRate = unstable_cache(
  async (): Promise<CurrentRate | null> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("exchange_rates")
      .select("rate, day")
      .eq("currency_from", "USD")
      .eq("currency_to", "CUP")
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const ageDays = Math.floor((Date.now() - new Date(`${data.day}T00:00:00`).getTime()) / 86_400_000);
    return { rate: Number(data.rate), day: data.day, ageDays, stale: ageDays > RATE_STALE_DAYS };
  },
  ["currency_current_rate"],
  { revalidate: 60, tags: ["exchange_rates"] },
);

/**
 * Tasa USD→CUP del día, o error si falta o está vieja (espejo TS de
 * current_usd_rate_strict). Usar en toda operación que congele montos USD.
 */
export async function assertFreshRate(): Promise<number> {
  const current = await getCurrentRate();
  if (!current) {
    throw new Error("No hay tasa USD→CUP registrada. Registra la tasa del día en /remesas/tasas.");
  }
  if (current.stale) {
    throw new Error(
      `La última tasa USD→CUP es del ${current.day} (más de ${RATE_STALE_DAYS} días). Registra la tasa del día en /remesas/tasas.`,
    );
  }
  return current.rate;
}

/**
 * Precio de venta en CUP desde el precio USD: conversión exacta al peso entero
 * (sin redondear a múltiplo de 5 — decisión del dueño).
 * Espejo TS de product_price_cup (migración 0045).
 */
export function priceCupFromUsd(usd: number, rate: number): number {
  return Math.round(usd * rate);
}

/** Equivalente USD congelando la tasa dada (redondeo a centavos). */
export function usdAt(amountCup: number, rate: number): number {
  return Math.round((amountCup / rate) * 100) / 100;
}

/**
 * Tasa USD→CUP vigente en una fecha: la más reciente registrada en o antes de
 * `day` (YYYY-MM-DD). Devuelve null si no había ninguna tasa en/antes de esa
 * fecha. Espejo TS de usd_rate_on (migración 0049). Para operaciones fechadas
 * (no se aplica la regla de frescura de 3 días — esa es para "la tasa de hoy").
 */
export const getRateForDate = unstable_cache(
  async (day: string, from = "USD", to = "CUP"): Promise<number | null> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("exchange_rates")
      .select("rate")
      .eq("currency_from", from)
      .eq("currency_to", to)
      .lte("day", day)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? Number(data.rate) : null;
  },
  ["currency_rate_for_date"],
  { revalidate: 60, tags: ["exchange_rates"] },
);

/** Tasa vigente en `day`, o error claro si no había ninguna en/antes de esa fecha. */
export async function assertRateForDate(day: string): Promise<number> {
  const rate = await getRateForDate(day);
  if (rate == null || rate <= 0) {
    throw new Error(
      `No hay tasa USD→CUP registrada en o antes del ${day}. Registra la tasa de esa fecha en /remesas/tasas.`,
    );
  }
  return rate;
}

/** Última tasa registrada from→to, o null si nunca se registró una. */
export const getRate = unstable_cache(
  async (from: string, to = "CUP"): Promise<number | null> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("exchange_rates")
      .select("rate")
      .eq("currency_from", from)
      .eq("currency_to", to)
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? Number(data.rate) : null;
  },
  ["currency_latest_rate"],
  { revalidate: 60, tags: ["exchange_rates"] },
);

/** Últimas tasas USD→CUP y EUR→CUP. */
export async function getRates(): Promise<Rates> {
  const [usd, eur] = await Promise.all([getRate("USD"), getRate("EUR")]);
  return { USD: usd, EUR: eur };
}

/**
 * Convierte un monto en su moneda nativa a CUP. Si no hay tasa registrada
 * para la moneda, devuelve null (la UI debe mostrar "—" y sugerir registrar
 * una tasa en /remesas/tasas — nunca asumir tasa 1).
 */
export function toCup(amount: number, currency: Currency, rates: Rates): number | null {
  if (currency === "CUP") return amount;
  const rate = rates[currency];
  if (rate == null || rate <= 0) return null;
  return Math.round(amount * rate * 100) / 100;
}

/** Equivalente en USD (moneda rectora) de un monto CUP, o null sin tasa. */
export function cupToUsd(cup: number, usdRate: number | null): number | null {
  if (usdRate == null || usdRate <= 0) return null;
  return Math.round((cup / usdRate) * 100) / 100;
}

/** Formato simple para equivalentes USD ("≈ 1 234.56 USD" o "—"). */
export function formatUsd(usd: number | null): string {
  if (usd == null) return "—";
  return `${new Intl.NumberFormat("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(usd)} USD`;
}
