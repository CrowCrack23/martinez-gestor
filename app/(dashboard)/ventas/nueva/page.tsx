import Link from "next/link";
import { requireRole, businessScope } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { listWarehouses } from "@/lib/warehouses";
import { listProductsLite } from "@/lib/products-lite";
import {
  ORDER_ORIGIN_LABEL, PAYMENT_METHOD_LABEL,
} from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { OrderLineEditor } from "@/components/order-line-editor";
import { createOrderAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaVentaPage({ searchParams }: { searchParams: SP }) {
  const user = await requireRole(["admin", "vendedor"]);
  const scope = businessScope(user);
  const [customers, warehouses, products, sp] = await Promise.all([
    listCustomers(), listWarehouses(scope), listProductsLite(scope), searchParams,
  ]);
  const activeWarehouses = warehouses.filter((w) => w.active);
  const activeCustomers = customers.filter((c) => c.active);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva venta</h1>
        <p className="text-sm text-muted-foreground">Se crea en estado borrador. Al confirmar, el stock se descuenta del almacén seleccionado.</p>
      </div>
      <Flash error={sp.error} />
      {activeWarehouses.length === 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
          No hay almacenes activos. <Link href="/almacenes/nuevo" className="underline">Crear uno</Link>.
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <form action={createOrderAction} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Cliente</Label>
                <Select id="customer_id" name="customer_id" defaultValue="">
                  <option value="">— Consumidor final —</option>
                  {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Almacén origen *</Label>
                <Select id="warehouse_id" name="warehouse_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="origin">Origen</Label>
                <Select id="origin" name="origin" defaultValue="pos">
                  {Object.entries(ORDER_ORIGIN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_method">Pago</Label>
                <Select id="payment_method" name="payment_method" defaultValue="efectivo">
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Ref. externa</Label>
                <Input id="reference" name="reference" placeholder="Nº pedido web, etc." />
              </div>
            </div>
            <OrderLineEditor products={products} />
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/ventas">Cancelar</Link></Button>
              <Button type="submit">Crear borrador</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
