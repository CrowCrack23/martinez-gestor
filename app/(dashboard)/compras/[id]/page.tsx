import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission, businessScope } from "@/lib/auth";
import { getPurchaseOrder, STATUS_BADGE, STATUS_LABEL } from "@/lib/purchases";
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
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  cancelPurchaseOrderAction,
  deletePurchaseOrderAction,
  receivePurchaseOrderAction,
  updatePurchaseOrderAction,
} from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

export default async function CompraDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("compras");
  const scope = businessScope(user);
  const { id } = await params;
  const [po, sp] = await Promise.all([getPurchaseOrder(id, scope), searchParams]);
  if (!po) notFound();

  const editable = po.status === "borrador";
  const canDelete = hasRole(user, ["admin"]);
  const update = updatePurchaseOrderAction.bind(null, po.id);
  const receive = receivePurchaseOrderAction.bind(null, po.id);
  const cancel = cancelPurchaseOrderAction.bind(null, po.id);
  const remove = deletePurchaseOrderAction.bind(null, po.id);

  if (!editable) {
    return (
      <div className="max-w-3xl space-y-6">
        <Header po={po} />
        <Flash success={sp.success} error={sp.error} />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Proveedor</div><div>{po.supplier_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Almacén destino</div><div>{po.warehouse_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Nº factura</div><div>{po.reference || "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Creada</div><div>{formatDateTime(po.created_at)}</div></div>
              {po.received_at && (
                <div><div className="text-muted-foreground text-xs">Recibida</div><div>{formatDateTime(po.received_at)}</div></div>
              )}
            </div>
            {po.notes && (
              <div className="text-sm"><div className="text-muted-foreground text-xs mb-1">Notas</div>{po.notes}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Cant.</th>
                <th className="px-4 py-3 font-medium text-right">Costo USD</th>
                <th className="px-4 py-3 font-medium text-right">Costo CUP</th>
                <th className="px-4 py-3 font-medium text-right">Subtotal CUP</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{l.product_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{l.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{l.unit_cost_usd != null ? `${l.unit_cost_usd.toFixed(2)} USD` : "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(l.unit_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                  {po.total_usd != null ? `${po.total_usd.toFixed(2)} USD` : ""}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(po.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </Card>

        {po.movement_id && (
          <div className="text-xs text-muted-foreground">
            Movimiento generado:{" "}
            <Link href="/inventario/movimientos" className="underline">ver historial</Link>
          </div>
        )}
        <div>
          <Button asChild variant="ghost"><Link href="/compras">← Volver</Link></Button>
        </div>
      </div>
    );
  }

  // Editable (borrador)
  const [suppliers, warehouses, products, rate] = await Promise.all([
    listSuppliers(),
    listWarehouses(scope),
    listProductsLite(scope),
    getCurrentRate(),
  ]);
  const activeSuppliers = suppliers.filter((s) => s.active || s.id === po.supplier_id);
  const activeWarehouses = warehouses.filter((w) => w.active || w.id === po.warehouse_id);

  return (
    <div className="max-w-3xl space-y-6">
      <Header po={po} />
      <RateBanner />
      <Flash success={sp.success} error={sp.error} />

      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="supplier_id">Proveedor *</Label>
                <Select id="supplier_id" name="supplier_id" required defaultValue={po.supplier_id}>
                  {activeSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Almacén destino *</Label>
                <Select id="warehouse_id" name="warehouse_id" required defaultValue={po.warehouse_id}>
                  {activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Nº factura del proveedor</Label>
              <Input id="reference" name="reference" defaultValue={po.reference} />
            </div>
            <PurchaseLineEditor
              products={products}
              rate={rate && !rate.stale ? rate.rate : null}
              initialLines={po.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost_usd: l.unit_cost_usd }))}
            />
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={po.notes} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/compras">Cancelar</Link></Button>
              <Button type="submit" variant="outline">Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="font-medium">Recibir orden</div>
            <div className="text-sm text-muted-foreground">Confirma la recepción y genera el movimiento de entrada en {po.warehouse_name}.</div>
          </div>
          <form action={receive}>
            <Button type="submit">Recibir y actualizar stock</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="font-medium">{canDelete ? "Cancelar / eliminar" : "Cancelar"}</div>
            <div className="text-sm text-muted-foreground">
              {canDelete ? "Cancelar la deja en historial; eliminar la borra por completo." : "Cancelar la deja en historial."}
            </div>
          </div>
          <div className="flex gap-2">
            <form action={cancel}><Button type="submit" variant="outline">Cancelar</Button></form>
            {canDelete && <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ po }: { po: { code: string; status: "borrador" | "recibida" | "cancelada"; total_amount: number } }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold font-mono">{po.code}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[po.status]}`}>
            {STATUS_LABEL[po.status]}
          </span>
          <span className="text-sm text-muted-foreground">Total <span className="font-mono">{formatPrice(po.total_amount)}</span></span>
        </div>
      </div>
    </div>
  );
}
