import { requireRole } from "@/lib/auth";
import { listAttendance, listEmployees } from "@/lib/hr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flash } from "@/components/flash";
import { saveAttendanceAction } from "./actions";

type SP = Promise<{ day?: string; success?: string; error?: string }>;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function AsistenciaPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "rrhh"]);
  const sp = await searchParams;
  const day = sp.day || todayISO();
  const [emps, att] = await Promise.all([listEmployees(), listAttendance(day)]);
  const active = emps.filter((e) => e.active);
  const attByEmp = new Map(att.map((a) => [a.employee_id, a]));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asistencia</h1>
        <p className="text-sm text-muted-foreground">Marca presencia y horas trabajadas por día. Se usa para calcular la nómina.</p>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form className="flex items-end gap-3 text-sm" action="/asistencia">
            <div className="space-y-1"><Label htmlFor="day" className="text-xs">Fecha</Label><Input id="day" name="day" type="date" defaultValue={day} className="h-9 w-44" /></div>
            <Button type="submit" variant="secondary" size="sm">Cambiar fecha</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <form action={saveAttendanceAction} className="space-y-3">
            <input type="hidden" name="day" value={day} />
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay empleados activos.</p>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_auto_120px] gap-3 px-2 py-1 text-xs text-muted-foreground">
                  <div>Empleado</div>
                  <div>Presente</div>
                  <div className="text-right">Horas</div>
                </div>
                {active.map((e) => {
                  const a = attByEmp.get(e.id);
                  const present = a?.present ?? true;
                  const hours = a?.hours ?? 8;
                  return (
                    <div key={e.id} className="grid grid-cols-[1fr_auto_120px] gap-3 px-2 py-2 items-center hover:bg-muted/30 rounded-md">
                      <input type="hidden" name="employee_id" value={e.id} />
                      <div>
                        <div className="text-sm">{e.first_name} {e.last_name}</div>
                        <div className="text-xs text-muted-foreground">{e.position_name ?? "—"}</div>
                      </div>
                      <label className="inline-flex">
                        <input type="checkbox" name={`present_${e.id}`} defaultChecked={present} className="size-5" />
                      </label>
                      <Input name={`hours_${e.id}`} type="number" step="0.5" min={0} max={24} defaultValue={String(hours)} className="h-9 text-right" />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button type="submit">Guardar asistencia</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
