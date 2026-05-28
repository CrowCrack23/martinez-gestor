import Link from "next/link";
import { Pencil, Plus, Settings2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listEmployees } from "@/lib/hr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";

type SP = Promise<{ success?: string; error?: string }>;

export default async function EmpleadosPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("empleados");
  const [emps, sp] = await Promise.all([listEmployees(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Empleados</h1>
          <p className="text-sm text-muted-foreground">Personal de Martínez. Cada empleado puede tener o no un usuario del sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/empleados/posiciones"><Settings2 className="size-4" />Posiciones</Link></Button>
          <Button asChild><Link href="/empleados/nuevo"><Plus className="size-4" />Nuevo</Link></Button>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Posición</th>
              <th className="px-4 py-3 font-medium">Sucursal</th>
              <th className="px-4 py-3 font-medium text-right">Salario</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {emps.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin empleados registrados.</td></tr>
            )}
            {emps.map((e) => (
              <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{e.code}</td>
                <td className="px-4 py-3 font-medium">{e.first_name} {e.last_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.position_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.warehouse_name ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(e.monthly_salary)}</td>
                <td className="px-4 py-3">
                  {e.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/empleados/${e.id}`}><Pencil className="size-3.5" />Editar</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
