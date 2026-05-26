import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listStoresLite } from "@/lib/stores-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { WAREHOUSE_TYPE_LABEL } from "@/lib/warehouses";
import { createWarehouseAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoAlmacenPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero"]);
  const [stores, sp] = await Promise.all([listStoresLite(), searchParams]);
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo almacén</h1>
        <p className="text-sm text-muted-foreground">Define una ubicación física o lógica donde se guarda stock.</p>
      </div>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createWarehouseAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="code">Código</Label>
                <Input id="code" name="code" required placeholder="ALM-MIR" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select id="type" name="type" required defaultValue="almacen_central">
                  {Object.entries(WAREHOUSE_TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" required placeholder="Almacén Miramar" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store_slug">Tienda asociada (opcional)</Label>
              <Select id="store_slug" name="store_slug" defaultValue="">
                <option value="">— Ninguna —</option>
                {stores.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Textarea id="address" name="address" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/almacenes">Cancelar</Link></Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
