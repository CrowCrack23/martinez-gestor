import Link from "next/link";
import { requireRole, businessScope } from "@/lib/auth";
import { listSuppliers } from "@/lib/suppliers";
import { listWarehouses } from "@/lib/warehouses";
import { listProductsLite } from "@/lib/products-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { PurchaseLineEditor } from "@/components/purchase-line-editor";
import { RateBanner } from "@/components/rate-banner";
import { getCurrentRate } from "@/lib/currency";
import { createPurchaseOrderAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaCompraPage({ searchParams }: { searchParams: SP }) {
  const user = await requireRole(["admin", "almacenero"]);
  const scope = businessScope(user);
  const [suppliers, warehouses, products, rate, sp] = await Promise.all([
    listSuppliers(),
    listWarehouses(scope),
    listProductsLite(scope),
    getCurrentRate(),
    searchParams,
  ]);
  const activeSuppliers = suppliers.filter((s) => s.active);
  const activeWarehouses = warehouses.filter((w) => w.active);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nueva orden de compra</h1>
        <p className="text-sm text-muted-foreground">Los costos se registran en USD; el equivalente CUP queda congelado a la tasa del día. Se crea en estado borrador.</p>
      </div>
      <RateBanner />
      <Flash error={sp.error} />
      {(activeSuppliers.length === 0 || activeWarehouses.length === 0) && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
          {activeSuppliers.length === 0 && <div>No hay proveedores activos. <Link href="/proveedores/nuevo" className="underline">Crear uno</Link>.</div>}
          {activeWarehouses.length === 0 && <div>No hay almacenes activos. <Link href="/almacenes/nuevo" className="underline">Crear uno</Link>.</div>}
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <form action={createPurchaseOrderAction} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="supplier_id">Proveedor *</Label>
                <Select id="supplier_id" name="supplier_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Almacén destino *</Label>
                <Select id="warehouse_id" name="warehouse_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="operation_date">Fecha de la compra *</Label>
                <Input id="operation_date" name="operation_date" type="date" defaultValue={today} required />
                <p className="text-xs text-muted-foreground">Congela la tasa USD→CUP vigente en esa fecha.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="reference">Nº factura del proveedor</Label>
                <Input id="reference" name="reference" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment">Forma de pago *</Label>
                <Select id="payment" name="payment" required defaultValue="credito">
                  <option value="credito">A crédito (cuentas por pagar)</option>
                  <option value="contado">De contado (sale de la caja del negocio)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_currency">Moneda del pago de contado</Label>
                <Select id="payment_currency" name="payment_currency" defaultValue="USD">
                  <option value="USD">USD (sale de la Caja USD)</option>
                  <option value="CUP">CUP (sale de la Caja CUP)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="freight_usd">Gasto de transportación (USD)</Label>
                <Input id="freight_usd" name="freight_usd" type="number" step="any" min={0} placeholder="0" />
                <p className="text-xs text-muted-foreground">Se reparte y se suma al costo de los productos al recibir.</p>
              </div>
            </div>
            <PurchaseLineEditor products={products} rate={rate && !rate.stale ? rate.rate : null} />
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/compras">Cancelar</Link></Button>
              <Button type="submit">Crear borrador</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
