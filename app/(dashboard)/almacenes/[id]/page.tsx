import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/auth";
import { getWarehouse, WAREHOUSE_TYPE_LABEL } from "@/lib/warehouses";
import { listStoresLite } from "@/lib/stores-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteWarehouseAction, updateWarehouseAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default async function EditarAlmacenPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireRole(["admin", "almacenero"]);
  const { id } = await params;
  const [warehouse, stores, sp] = await Promise.all([getWarehouse(id), listStoresLite(), searchParams]);
  if (!warehouse) notFound();
  const canDelete = hasRole(user, ["admin"]);

  const updateAction = updateWarehouseAction.bind(null, warehouse.id);
  const deleteAction = deleteWarehouseAction.bind(null, warehouse.id);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Editar almacén</h1>
        <p className="text-sm text-muted-foreground font-mono">{warehouse.code}</p>
      </div>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={updateAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input id="code" name="code" required defaultValue={warehouse.code} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select id="type" name="type" required defaultValue={warehouse.type}>
                  {Object.entries(WAREHOUSE_TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required defaultValue={warehouse.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store_slug">Tienda asociada</Label>
              <Select id="store_slug" name="store_slug" defaultValue={warehouse.store_slug ?? ""}>
                <option value="">— Ninguna —</option>
                {stores.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Textarea id="address" name="address" rows={2} defaultValue={warehouse.address} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={warehouse.active} className="size-4" />
              Activo
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/almacenes">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <div className="font-medium">Eliminar almacén</div>
              <div className="text-sm text-muted-foreground">Falla si tiene stock o movimientos asociados.</div>
            </div>
            <form action={deleteAction}>
              <Button type="submit" variant="destructive">Eliminar</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
