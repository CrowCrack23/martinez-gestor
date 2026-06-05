"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { addMovement, createHolder, updateHolder, type HolderKind, type HolderLocation, type MovementKind } from "@/lib/money-holders";
import type { DeliveryCurrency } from "@/lib/supabase-types";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

const KINDS: HolderKind[] = ["mensajero", "deudor", "socio", "caja", "otro"];
const LOCATIONS: HolderLocation[] = ["alla", "aca"];
const CURRENCIES: DeliveryCurrency[] = ["CUP", "USD", "EUR"];
const MOVEMENT_KINDS: MovementKind[] = ["entrega", "cobro", "ajuste", "liquidacion", "deuda"];

export async function createHolderAction(formData: FormData) {
  await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const kind = String(formData.get("kind") ?? "otro") as HolderKind;
    const location = String(formData.get("location") ?? "aca") as HolderLocation;
    if (!KINDS.includes(kind)) throw new ValidationError("Tipo inválido.");
    if (!LOCATIONS.includes(location)) throw new ValidationError("Ubicación inválida.");
    await createHolder({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      name: requireString(formData, "name", "Nombre"),
      kind,
      location,
      app_user_id: optionalString(formData, "app_user_id") || null,
      notes: optionalString(formData, "notes"),
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/dinero?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/dinero?business=${business}&success=Tenedor+creado`);
}

export async function toggleHolderAction(id: string, business: string, active: boolean) {
  await requireRole(["admin"]);
  try {
    await updateHolder(id, { active });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/dinero?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/dinero?business=${business}&success=Actualizado`);
}

export async function addMovementAction(formData: FormData) {
  const user = await requireRole(["admin"]);
  const business = String(formData.get("business_slug") ?? "");
  try {
    const amountRaw = Number(formData.get("amount") ?? 0);
    if (!Number.isFinite(amountRaw) || amountRaw === 0) throw new ValidationError("Monto inválido.");
    const direction = String(formData.get("direction") ?? "in"); // in: recibe, out: devuelve/paga
    const amount = direction === "out" ? -Math.abs(amountRaw) : Math.abs(amountRaw);
    const currency = String(formData.get("currency") ?? "CUP") as DeliveryCurrency;
    const kind = String(formData.get("kind") ?? "ajuste") as MovementKind;
    if (!CURRENCIES.includes(currency)) throw new ValidationError("Moneda inválida.");
    if (!MOVEMENT_KINDS.includes(kind)) throw new ValidationError("Tipo de movimiento inválido.");
    await addMovement({
      business_slug: requireString(formData, "business_slug", "Negocio"),
      holder_id: requireString(formData, "holder_id", "Tenedor"),
      amount,
      currency,
      kind,
      occurred_at: requireString(formData, "occurred_at", "Fecha"),
      notes: optionalString(formData, "notes"),
      created_by: user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/remesas/dinero?business=${business}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/remesas/dinero?business=${business}&success=Movimiento+registrado`);
}
