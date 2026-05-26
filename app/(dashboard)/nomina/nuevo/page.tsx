import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createPayrollRunAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoPeriodoPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "rrhh"]);
  const sp = await searchParams;
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo período de nómina</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createPayrollRunAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="period_start">Inicio</Label><Input id="period_start" name="period_start" type="date" required defaultValue={firstOfMonth} /></div>
              <div className="space-y-2"><Label htmlFor="period_end">Fin</Label><Input id="period_end" name="period_end" type="date" required defaultValue={lastOfMonth} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/nomina">Cancelar</Link></Button>
              <Button type="submit">Crear y calcular</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Se crearán automáticamente líneas para cada empleado activo. Para cada uno, se contarán los días con presente=true
        en el rango y se calculará proporcionalmente al salario mensual. Si no hay registros de asistencia, se asume el período completo.
      </p>
    </div>
  );
}
