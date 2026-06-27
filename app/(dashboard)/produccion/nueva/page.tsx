import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listBoms } from "@/lib/production";
import { listWarehouses } from "@/lib/warehouses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createProductionOrderAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaProduccionPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("produccion");
  const [boms, warehouses, sp] = await Promise.all([listBoms(), listWarehouses(businessScope(user)), searchParams]);
  const activeBoms = boms.filter((b) => b.active);
  const activeWh = warehouses.filter((w) => w.active);

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Nueva orden de producción</h1>
      <Flash error={sp.error} />
      {activeBoms.length === 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
          No hay recetas activas. <Link href="/recetas/nueva" className="underline">Crear una</Link>.
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <form action={createProductionOrderAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bom_id">Receta *</Label>
              <Select id="bom_id" name="bom_id" required defaultValue="">
                <option value="">— Selecciona —</option>
                {activeBoms.map((b) => <option key={b.id} value={b.id}>{b.name} (rinde {b.yield} de {b.product_name})</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="warehouse_id">Almacén / centro *</Label>
              <Select id="warehouse_id" name="warehouse_id" required defaultValue="">
                <option value="">— Selecciona —</option>
                {activeWh.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad a producir (vueltas de receta)</Label>
              <Input id="quantity" name="quantity" type="number" step="0.01" min={0.01} required defaultValue="1" />
              <p className="text-xs text-muted-foreground">Multiplica los insumos y el rendimiento de la receta.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="operation_date">Fecha de la producción *</Label>
              <Input id="operation_date" name="operation_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              <p className="text-xs text-muted-foreground">Si es del centro, congela la tasa de esa fecha y fecha la entrega/pago.</p>
            </div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/produccion">Cancelar</Link></Button>
              <Button type="submit">Crear borrador</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
