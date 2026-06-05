import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listPointsOfSale } from "@/lib/points-of-sale";
import { listUsers } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import {
  deactivatePointOfSaleStaffAction,
  upsertPointOfSaleStaffAction,
} from "./actions";

type SP = Promise<{ error?: string; success?: string }>;

export default async function PuntosVentaPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("puntos_venta");
  const scope = businessScope(user);
  const [points, users, sp] = await Promise.all([listPointsOfSale(scope), listUsers(), searchParams]);
  const activeUsers = users.filter((u) => u.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Puntos de venta</h1>
          <p className="text-sm text-muted-foreground">
            Cada punto tiene un trabajador fijo que cobra un % de la ganancia (venta − costo) de sus ventas.
            El punto es un almacén tipo &quot;Punto de venta&quot;: créalo en{" "}
            <Link href="/almacenes" className="underline">Almacenes</Link> y asígnale aquí su trabajador.
          </p>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Punto de venta</th>
                <th className="px-4 py-3 font-medium">Negocio</th>
                <th className="px-4 py-3 font-medium">Trabajador</th>
                <th className="px-4 py-3 font-medium text-right">% comisión</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {points.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    No hay almacenes tipo &quot;Punto de venta&quot;. Crea uno en Almacenes con ese tipo.
                  </td>
                </tr>
              )}
              {points.map((p) => {
                const deactivate = deactivatePointOfSaleStaffAction.bind(null, p.warehouse_id);
                return (
                  <tr key={p.warehouse_id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.warehouse_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.warehouse_code}</div>
                    </td>
                    <td className="px-4 py-3">{p.store_slug ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.user_id && p.staff_active ? (
                        p.user_name
                      ) : (
                        <span className="text-muted-foreground text-xs">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {p.user_id && p.staff_active ? `${p.commission_pct.toFixed(2)} %` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.user_id && p.staff_active && (
                        <form action={deactivate} className="inline">
                          <Button type="submit" variant="outline" size="sm">Quitar</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {points.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="font-medium mb-3">Asignar / cambiar trabajador</div>
            <form action={upsertPointOfSaleStaffAction} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="warehouse_id" className="text-xs">Punto de venta</Label>
                <Select id="warehouse_id" name="warehouse_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {points.map((p) => (
                    <option key={p.warehouse_id} value={p.warehouse_id}>{p.warehouse_name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="user_id" className="text-xs">Trabajador</Label>
                <Select id="user_id" name="user_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="commission_pct" className="text-xs">% de la ganancia</Label>
                <Input
                  id="commission_pct"
                  name="commission_pct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue="0"
                  className="w-32"
                  required
                />
              </div>
              <Button type="submit" size="sm">Guardar</Button>
            </form>
            <p className="text-xs text-muted-foreground mt-2">
              El % es negociable por trabajador y se aplica en el cuadre diario sobre la ganancia de su punto.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
