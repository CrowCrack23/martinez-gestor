"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { confirmCentroDaily, reopenCentroDaily } from "@/lib/centro-closures";

export async function confirmCentroDailyAction(day: string) {
  const user = await requireRole(["admin", "almacenero", "contador"]);
  try {
    await confirmCentroDaily(day, user.id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/cuadres/centro?day=${day}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/cuadres/centro?day=${day}&success=Cuadre+del+centro+confirmado`);
}

export async function reopenCentroDailyAction(day: string) {
  await requireRole(["admin"]);
  try {
    await reopenCentroDaily(day);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/cuadres/centro?day=${day}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/cuadres/centro?day=${day}&success=Cuadre+del+centro+reabierto`);
}
