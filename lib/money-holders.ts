import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { getSupabase } from "./supabase";
import type { Database, DeliveryCurrency } from "./supabase-types";

// Tenedores de dinero y deudores de los negocios de remesas (migración 0034).
//
// Responde a "¿quién tiene el dinero y cuánto hay allá vs acá?": mensajeros
// con efectivo pendiente de rendir, deudores que no han pagado, cajas, etc.
// Saldo del holder = Σ movimientos (+ recibe dinero del negocio, − lo
// devuelve/paga) por moneda. Un saldo positivo es dinero del negocio en manos
// de esa persona. Al entregar una remesa, lib/remittances.ts registra
// automáticamente el movimiento del mensajero (su efectivo disminuye).

const TAG = "money_holders";

function bust() {
  revalidateTag(TAG, "max");
}

export type MoneyHolder = Database["public"]["Tables"]["money_holders"]["Row"];
export type MoneyMovement = Database["public"]["Tables"]["money_movements"]["Row"];
export type HolderKind = MoneyHolder["kind"];
export type HolderLocation = MoneyHolder["location"];
export type MovementKind = MoneyMovement["kind"];

export const HOLDER_KIND_LABEL: Record<HolderKind, string> = {
  mensajero: "Mensajero",
  deudor: "Deudor",
  socio: "Socio",
  caja: "Caja",
  otro: "Otro",
};

export const HOLDER_LOCATION_LABEL: Record<HolderLocation, string> = {
  alla: "Allá",
  aca: "Acá (Cuba)",
};

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  entrega: "Entrega de remesa",
  cobro: "Cobro",
  ajuste: "Ajuste",
  liquidacion: "Liquidación",
  deuda: "Deuda",
};

export const listHolders = unstable_cache(
  async (business?: string): Promise<MoneyHolder[]> => {
    const sb = getSupabase();
    let q = sb
      .from("money_holders")
      .select("*")
      .order("active", { ascending: false })
      .order("name");
    if (business) q = q.eq("business_slug", business);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MoneyHolder[];
  },
  ["money_holders_list"],
  { revalidate: 60, tags: [TAG] },
);

export type HolderBalance = {
  holder: MoneyHolder;
  balances: Partial<Record<DeliveryCurrency, number>>;
};

export type MoneyOverview = {
  holders: HolderBalance[];
  byLocation: Record<HolderLocation, Partial<Record<DeliveryCurrency, number>>>;
};

/** Saldos por holder × moneda y totales allá vs acá. */
export const holderBalances = unstable_cache(
  async (business: string): Promise<MoneyOverview> => {
    const sb = getSupabase();
    const [{ data: holders, error: hErr }, { data: movements, error: mErr }] = await Promise.all([
      sb.from("money_holders").select("*").eq("business_slug", business).order("name"),
      sb.from("money_movements").select("holder_id, amount, currency").eq("business_slug", business),
    ]);
    if (hErr) throw hErr;
    if (mErr) throw mErr;

    const sums = new Map<string, Partial<Record<DeliveryCurrency, number>>>();
    for (const m of movements ?? []) {
      const cur = sums.get(m.holder_id) ?? {};
      const c = m.currency as DeliveryCurrency;
      cur[c] = Math.round(((cur[c] ?? 0) + Number(m.amount)) * 100) / 100;
      sums.set(m.holder_id, cur);
    }

    const byLocation: MoneyOverview["byLocation"] = { alla: {}, aca: {} };
    const result: HolderBalance[] = [];
    for (const h of (holders ?? []) as MoneyHolder[]) {
      const balances = sums.get(h.id) ?? {};
      result.push({ holder: h, balances });
      const loc = byLocation[h.location];
      for (const [c, v] of Object.entries(balances)) {
        const cur = c as DeliveryCurrency;
        loc[cur] = Math.round(((loc[cur] ?? 0) + (v ?? 0)) * 100) / 100;
      }
    }
    return { holders: result, byLocation };
  },
  ["money_holder_balances"],
  { revalidate: 30, tags: [TAG] },
);

export async function createHolder(input: {
  business_slug: string;
  name: string;
  kind: HolderKind;
  location: HolderLocation;
  app_user_id?: string | null;
  notes?: string;
}): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("money_holders").insert({
    business_slug: input.business_slug,
    name: input.name,
    kind: input.kind,
    location: input.location,
    app_user_id: input.app_user_id ?? null,
    notes: input.notes ?? "",
  });
  if (error) throw error;
  bust();
}

export async function updateHolder(
  id: string,
  patch: Partial<{ name: string; kind: HolderKind; location: HolderLocation; app_user_id: string | null; active: boolean; notes: string }>,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("money_holders").update(patch).eq("id", id);
  if (error) throw error;
  bust();
}

export async function addMovement(input: {
  business_slug: string;
  holder_id: string;
  amount: number; // + el holder recibe dinero del negocio; − lo devuelve/paga
  currency: DeliveryCurrency;
  kind: MovementKind;
  occurred_at: string;
  notes?: string;
  created_by: string | null;
}): Promise<void> {
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error("Monto inválido.");
  const sb = getSupabase();
  const { error } = await sb.from("money_movements").insert({
    business_slug: input.business_slug,
    holder_id: input.holder_id,
    amount: input.amount,
    currency: input.currency,
    kind: input.kind,
    occurred_at: input.occurred_at,
    notes: input.notes ?? "",
    created_by: input.created_by,
  });
  if (error) throw error;
  bust();
}

export const listMovements = unstable_cache(
  async (holderId: string, limit = 50): Promise<MoneyMovement[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("money_movements")
      .select("*")
      .eq("holder_id", holderId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as MoneyMovement[]).map((m) => ({ ...m, amount: Number(m.amount) }));
  },
  ["money_movements_list"],
  { revalidate: 30, tags: [TAG] },
);

export type RecentMovement = MoneyMovement & { holder_name: string };

/** Últimos movimientos del negocio (con el nombre del tenedor), para revisar y corregir. */
export const listRecentMovements = unstable_cache(
  async (business: string, limit = 30): Promise<RecentMovement[]> => {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("money_movements")
      .select("*, money_holders(name)")
      .eq("business_slug", business)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    type R = MoneyMovement & { money_holders: { name: string } | null };
    return ((data ?? []) as unknown as R[]).map((m) => ({
      ...m,
      amount: Number(m.amount),
      holder_name: m.money_holders?.name ?? "—",
    }));
  },
  ["money_movements_recent"],
  { revalidate: 30, tags: [TAG] },
);

/**
 * Elimina un movimiento manual registrado por error. Los movimientos generados
 * automáticamente al entregar una remesa (`remittance_id` no nulo) no se borran
 * aquí: hay que cancelar/editar la remesa. El saldo del tenedor se recalcula
 * solo (es Σ de movimientos).
 */
export async function deleteMovement(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: mov, error } = await sb
    .from("money_movements")
    .select("id, remittance_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!mov) return;
  if (mov.remittance_id) {
    throw new Error("Este movimiento se generó al entregar una remesa. Cancela o edita la remesa en su lugar.");
  }
  const { error: dErr } = await sb.from("money_movements").delete().eq("id", id);
  if (dErr) throw dErr;
  bust();
}
