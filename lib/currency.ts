import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabase } from "./supabase";
import type { DeliveryCurrency } from "./supabase-types";

// Doble moneda con el dólar como moneda rectora: el libro contable sigue
// denominado en CUP (salvo cuentas con currency USD/EUR, p. ej. 1120 Caja
// USD, que guardan números en su moneda nativa). Estos helpers convierten
// con la última tasa registrada en exchange_rates (/remesas/tasas).
//
// Consulta exchange_rates directo (no importa lib/remittances.ts) para no
// crear ciclos de import; reutiliza el tag "exchange_rates" que ya invalida
// upsertExchangeRate.

export type Currency = DeliveryCurrency;

export type Rates = { USD: number | null; EUR: number | null };

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
