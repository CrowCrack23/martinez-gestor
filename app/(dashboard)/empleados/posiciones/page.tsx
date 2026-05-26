import { Trash2 } from "lucide-react";
import { requireRole, hasRole } from "@/lib/auth";
import { listPositions } from "@/lib/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";
import { createPositionAction, deletePositionAction, updatePositionAction } from "../actions";

type SP = Promise<{ success?: string; error?: string }>;

export default async function PosicionesPage({ searchParams }: { searchParams: SP }) {
  const user = await requireRole(["admin", "rrhh"]);
  const [positions, sp] = await Promise.all([listPositions(), searchParams]);
  const canDelete = hasRole(user, ["admin"]);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Posiciones</h1>
        <p className="text-sm text-muted-foreground">Roles laborales con salario base de referencia.</p>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createPositionAction} className="grid grid-cols-[1fr_140px_auto] gap-2 items-end">
            <div className="space-y-1"><Label htmlFor="name" className="text-xs">Nueva posición</Label><Input id="name" name="name" required placeholder="Cajero" /></div>
            <div className="space-y-1"><Label htmlFor="base_salary" className="text-xs">Salario base</Label><Input id="base_salary" name="base_salary" type="number" step="0.01" min={0} defaultValue="0" /></div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium text-right">Salario base</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin posiciones.</td></tr>
            )}
            {positions.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0">
                <td colSpan={4} className="p-0">
                  <form action={updatePositionAction.bind(null, p.id)} className="grid grid-cols-[1fr_140px_auto_auto] gap-2 items-center px-4 py-2">
                    <Input name="name" required defaultValue={p.name} className="h-9" />
                    <Input name="base_salary" type="number" step="0.01" min={0} defaultValue={String(p.base_salary)} className="h-9" />
                    <label className="flex items-center gap-2 text-xs whitespace-nowrap">
                      <input type="checkbox" name="active" defaultChecked={p.active} className="size-4" />Activo
                    </label>
                    <div className="flex gap-1">
                      <Button type="submit" size="sm" variant="outline">{formatPrice(p.base_salary).slice(0, 0)}Guardar</Button>
                    </div>
                  </form>
                  {canDelete && (
                    <form action={deletePositionAction.bind(null, p.id)} className="px-4 pb-2 -mt-1 text-right">
                      <button type="submit" className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
                        <Trash2 className="size-3" /> eliminar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
