import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listPositions } from "@/lib/hr";
import { listWarehouses } from "@/lib/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createEmployeeAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoEmpleadoPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("empleados");
  const [positions, warehouses, sp] = await Promise.all([listPositions(), listWarehouses(), searchParams]);
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo empleado</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createEmployeeAction} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="code">Código *</Label><Input id="code" name="code" required placeholder="EMP-001" /></div>
              <div className="space-y-2"><Label htmlFor="document_id">Cédula / DNI</Label><Input id="document_id" name="document_id" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="first_name">Nombre *</Label><Input id="first_name" name="first_name" required /></div>
              <div className="space-y-2"><Label htmlFor="last_name">Apellido</Label><Input id="last_name" name="last_name" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="position_id">Posición</Label>
                <Select id="position_id" name="position_id" defaultValue="">
                  <option value="">— Ninguna —</option>
                  {positions.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Sucursal / almacén</Label>
                <Select id="warehouse_id" name="warehouse_id" defaultValue="">
                  <option value="">— Ninguna —</option>
                  {warehouses.filter((w) => w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="hire_date">Fecha ingreso</Label><Input id="hire_date" name="hire_date" type="date" /></div>
              <div className="space-y-2"><Label htmlFor="monthly_salary">Salario mensual</Label><Input id="monthly_salary" name="monthly_salary" type="number" step="0.01" min={0} defaultValue="0" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Textarea id="address" name="address" rows={2} /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/empleados">Cancelar</Link></Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
