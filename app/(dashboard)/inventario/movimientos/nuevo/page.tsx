import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listWarehouses } from "@/lib/warehouses";
import { listProductsLite } from "@/lib/products-lite";
import { listStock } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createMovementAction } from "../actions";
import { MovementForm } from "./movement-form";

type SP = Promise<{ error?: string }>;

export default async function NuevoMovimientoPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("movimientos");
  const scope = businessScope(user);
  const [warehouses, products, stockRows, sp] = await Promise.all([
    listWarehouses(scope),
    listProductsLite(scope),
    listStock({ scope }),
    searchParams,
  ]);
  // Existencias por almacén (solo con saldo) para acotar el selector de producto
  // en salidas/transferencias/mermas al almacén origen.
  const stock = stockRows
    .filter((r) => r.quantity > 0)
    .map((r) => ({ warehouse_id: r.warehouse_id, product_id: r.product_id, quantity: r.quantity }));
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo movimiento</h1>
        <p className="text-sm text-muted-foreground">El trigger en BD actualiza el stock automáticamente al guardar.</p>
      </div>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <MovementForm
            warehouses={warehouses.filter((w) => w.active).map((w) => ({ id: w.id, name: w.name }))}
            products={products}
            stock={stock}
            action={createMovementAction}
          />
        </CardContent>
      </Card>
      <div>
        <Button asChild variant="ghost"><Link href="/inventario/movimientos">← Volver</Link></Button>
      </div>
    </div>
  );
}
