"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { confirmDailyClosure } from "@/lib/closures";

export async function confirmDailyClosureAction(warehouseId: string, day: string) {
  const user = await requireRole(["admin", "vendedor", "contador"]);
  try {
    await confirmDailyClosure(warehouseId, day, user.id);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(
      `/cuadres?warehouse=${warehouseId}&day=${day}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`,
    );
  }
  redirect(`/cuadres?warehouse=${warehouseId}&day=${day}&success=Cuadre+confirmado`);
}
