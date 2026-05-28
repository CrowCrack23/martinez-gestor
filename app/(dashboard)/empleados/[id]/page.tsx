import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission } from "@/lib/auth";
import { getEmployee, listPositions } from "@/lib/hr";
import { listWarehouses } from "@/lib/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteEmployeeAction, updateEmployeeAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

export default async function EditarEmpleadoPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("empleados");
  const { id } = await params;
  const [emp, positions, warehouses, sp] = await Promise.all([
    getEmployee(id), listPositions(), listWarehouses(), searchParams,
  ]);
  if (!emp) notFound();
  const canDelete = hasRole(user, ["admin"]);
  const update = updateEmployeeAction.bind(null, emp.id);
  const remove = deleteEmployeeAction.bind(null, emp.id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{emp.first_name} {emp.last_name}</h1>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="code">Código *</Label><Input id="code" name="code" required defaultValue={emp.code} /></div>
              <div className="space-y-2"><Label htmlFor="document_id">Cédula / DNI</Label><Input id="document_id" name="document_id" defaultValue={emp.document_id} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="first_name">Nombre *</Label><Input id="first_name" name="first_name" required defaultValue={emp.first_name} /></div>
              <div className="space-y-2"><Label htmlFor="last_name">Apellido</Label><Input id="last_name" name="last_name" defaultValue={emp.last_name} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" defaultValue={emp.phone} /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={emp.email} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="position_id">Posición</Label>
                <Select id="position_id" name="position_id" defaultValue={emp.position_id ?? ""}>
                  <option value="">— Ninguna —</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Sucursal</Label>
                <Select id="warehouse_id" name="warehouse_id" defaultValue={emp.warehouse_id ?? ""}>
                  <option value="">— Ninguna —</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2"><Label htmlFor="hire_date">Ingreso</Label><Input id="hire_date" name="hire_date" type="date" defaultValue={emp.hire_date ?? ""} /></div>
              <div className="space-y-2"><Label htmlFor="termination_date">Baja</Label><Input id="termination_date" name="termination_date" type="date" defaultValue={emp.termination_date ?? ""} /></div>
              <div className="space-y-2"><Label htmlFor="monthly_salary">Salario</Label><Input id="monthly_salary" name="monthly_salary" type="number" step="0.01" min={0} defaultValue={String(emp.monthly_salary)} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Textarea id="address" name="address" rows={2} defaultValue={emp.address} /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} defaultValue={emp.notes} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={emp.active} className="size-4" />Activo
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/empleados">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div><div className="font-medium">Eliminar empleado</div><div className="text-sm text-muted-foreground">Falla si tiene asistencia o nóminas asociadas.</div></div>
            <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
