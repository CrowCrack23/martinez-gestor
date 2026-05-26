"use server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { upsertAttendance } from "@/lib/hr";

export async function saveAttendanceAction(formData: FormData) {
  const user = await requireRole(["admin", "rrhh"]);
  const day = String(formData.get("day") ?? "");
  if (!day) redirect(`/asistencia?error=Fecha+requerida`);

  const empIds = formData.getAll("employee_id").map(String);
  const rows = empIds.map((employee_id) => {
    const present = formData.get(`present_${employee_id}`) === "on";
    const hoursRaw = formData.get(`hours_${employee_id}`);
    const hours = Number(hoursRaw ?? 8);
    return {
      employee_id,
      day,
      present,
      hours: Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : (present ? 8 : 0),
      notes: "",
      recorded_by: user.id,
    };
  });
  try { await upsertAttendance(rows); }
  catch (e) { redirect(`/asistencia?day=${day}&error=${encodeURIComponent(e instanceof Error ? e.message : "Error")}`); }
  redirect(`/asistencia?day=${day}&success=Asistencia+guardada`);
}
