"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createBom, deleteBom, replaceBomComponents, updateBom } from "@/lib/production";
import { optionalString, requireString, ValidationError } from "@/lib/validation";

function parseComponents(form: FormData) {
  const ids = form.getAll("component_product_id").map(String);
  const qtys = form.getAll("quantity_per_unit").map((v) => Number(v));
  if (ids.length === 0) throw new ValidationError("Agrega al menos un insumo.");
  if (ids.length !== qtys.length) throw new ValidationError("Datos de insumos inconsistentes.");
  const out: { component_product_id: string; quantity_per_unit: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (!ids[i]) continue;
    if (!Number.isFinite(qtys[i]) || qtys[i] <= 0) throw new ValidationError(`Cantidad inválida en insumo ${i + 1}.`);
    out.push({ component_product_id: ids[i], quantity_per_unit: qtys[i] });
  }
  if (out.length === 0) throw new ValidationError("Agrega al menos un insumo válido.");
  return out;
}

export async function createBomAction(formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    const yieldN = Number(formData.get("yield") ?? 1);
    if (!Number.isFinite(yieldN) || yieldN <= 0) throw new ValidationError("Rendimiento inválido.");
    const id = await createBom({
      product_id: requireString(formData, "product_id", "Producto terminado"),
      name: requireString(formData, "name", "Nombre"),
      yield: yieldN,
      notes: optionalString(formData, "notes"),
      components: parseComponents(formData),
    });
    redirect(`/recetas/${id}?success=Receta+creada`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/recetas/nueva?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
}

export async function updateBomAction(id: string, formData: FormData) {
  await requireRole(["admin", "almacenero"]);
  try {
    const yieldN = Number(formData.get("yield") ?? 1);
    if (!Number.isFinite(yieldN) || yieldN <= 0) throw new ValidationError("Rendimiento inválido.");
    await updateBom(id, {
      product_id: requireString(formData, "product_id", "Producto terminado"),
      name: requireString(formData, "name", "Nombre"),
      yield: yieldN,
      notes: optionalString(formData, "notes"),
      active: formData.get("active") === "on",
    });
    await replaceBomComponents(id, parseComponents(formData));
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;
    redirect(`/recetas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`);
  }
  redirect(`/recetas/${id}?success=Receta+actualizada`);
}

export async function deleteBomAction(id: string) {
  await requireRole(["admin"]);
  try { await deleteBom(id); }
  catch (e) { redirect(`/recetas/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/recetas?success=Receta+eliminada`);
}
