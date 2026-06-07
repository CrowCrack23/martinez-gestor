import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission, businessScope } from "@/lib/auth";
import {
  getOrder, ORDER_CURRENCY_LABEL, ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, ORDER_ORIGIN_LABEL, PAYMENT_METHOD_LABEL,
} from "@/lib/sales";
import { listCustomers } from "@/lib/customers";
import { listWarehouses } from "@/lib/warehouses";
import { listProductsLite } from "@/lib/products-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { OrderLineEditor } from "@/components/order-line-editor";
import { getCurrentRate } from "@/lib/currency";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  cancelOrderAction, confirmOrderAction, deleteOrderAction, updateOrderAction,
} from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

export default async function VentaDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("ventas");
  const scope = businessScope(user);
  const { id } = await params;
  const [o, sp] = await Promise.all([getOrder(id, scope), searchParams]);
  if (!o) notFound();
  const editable = o.status === "borrador";
  const canDelete = hasRole(user, ["admin"]);
  const update = updateOrderAction.bind(null, o.id);
  const confirm = confirmOrderAction.bind(null, o.id);
  const cancel = cancelOrderAction.bind(null, o.id);
  const remove = deleteOrderAction.bind(null, o.id);

  if (!editable) {
    return (
      <div className="max-w-3xl space-y-6">
        <Header o={o} />
        <Flash success={sp.success} error={sp.error} />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Cliente</div><div>{o.customer_name ?? "Consumidor final"}</div></div>
              <div><div className="text-muted-foreground text-xs">Almacén origen</div><div>{o.warehouse_name}</div></div>
              <div><div className="text-muted-foreground text-xs">Origen</div><div>{ORDER_ORIGIN_LABEL[o.origin]}</div></div>
              <div><div className="text-muted-foreground text-xs">Pago</div><div>{PAYMENT_METHOD_LABEL[o.payment_method]} ({o.currency})</div></div>
              {o.currency === "USD" && o.amount_usd != null && (
                <div>
                  <div className="text-muted-foreground text-xs">Cobrado en USD</div>
                  <div className="font-mono">USD {o.amount_usd.toFixed(2)}{o.sale_rate != null ? ` (tasa ${o.sale_rate})` : ""}</div>
                </div>
              )}
              {o.status === "confirmada" && o.cogs_total > 0 && (
                <div>
                  <div className="text-muted-foreground text-xs">Costo (FIFO)</div>
                  <div className="font-mono">{formatPrice(o.cogs_total)}</div>
                </div>
              )}
              {o.amount_charged != null && (
                <div>
                  <div className="text-muted-foreground text-xs">Cobrado online</div>
                  <div className="font-mono">USD {o.amount_charged.toFixed(2)}{o.charge_currency === "CUP" ? " (registrado en CUP)" : ""}</div>
                </div>
              )}
              <div><div className="text-muted-foreground text-xs">Ref. externa</div><div>{o.reference || "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Creada</div><div>{formatDateTime(o.created_at)}</div></div>
              {o.confirmed_at && (
                <div><div className="text-muted-foreground text-xs">Confirmada</div><div>{formatDateTime(o.confirmed_at)}</div></div>
              )}
            </div>
            {o.notes && <div className="text-sm"><div className="text-muted-foreground text-xs mb-1">Notas</div>{o.notes}</div>}
          </CardContent>
        </Card>
        <Card>
          <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Cant.</th>
                <th className="px-4 py-3 font-medium text-right">Precio unit.</th>
                <th className="px-4 py-3 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{l.product_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{l.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(l.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <td colSpan={3} className="px-4 py-3 text-right">Total</td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(o.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </Card>
        <div>
          <Button asChild variant="ghost"><Link href="/ventas">← Volver</Link></Button>
        </div>
      </div>
    );
  }

  // Editable (borrador)
  const [customers, warehouses, products, rate] = await Promise.all([
    listCustomers(), listWarehouses(scope), listProductsLite(scope), getCurrentRate(),
  ]);
  const activeCustomers = customers.filter((c) => c.active || c.id === o.customer_id);
  const activeWarehouses = warehouses.filter((w) => w.active || w.id === o.warehouse_id);

  return (
    <div className="max-w-3xl space-y-6">
      <Header o={o} />
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="customer_id">Cliente</Label>
                <Select id="customer_id" name="customer_id" defaultValue={o.customer_id ?? ""}>
                  <option value="">— Consumidor final —</option>
                  {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Almacén origen *</Label>
                <Select id="warehouse_id" name="warehouse_id" required defaultValue={o.warehouse_id}>
                  {activeWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label htmlFor="origin">Origen</Label>
                <Select id="origin" name="origin" defaultValue={o.origin}>
                  {Object.entries(ORDER_ORIGIN_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_method">Pago</Label>
                <Select id="payment_method" name="payment_method" defaultValue={o.payment_method}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select id="currency" name="currency" defaultValue={o.currency}>
                  {Object.entries(ORDER_CURRENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Ref. externa</Label>
                <Input id="reference" name="reference" defaultValue={o.reference} />
              </div>
            </div>
            <OrderLineEditor
              products={products}
              rate={rate && !rate.stale ? rate.rate : null}
              initialLines={o.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity }))}
            />
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={o.notes} />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/ventas">Cancelar</Link></Button>
              <Button type="submit" variant="outline">Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="font-medium">Confirmar venta</div>
            <div className="text-sm text-muted-foreground">Genera el movimiento de salida y descuenta el stock de {o.warehouse_name}.</div>
          </div>
          <form action={confirm}><Button type="submit">Confirmar y descontar stock</Button></form>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="font-medium">{canDelete ? "Cancelar / eliminar" : "Cancelar"}</div>
            <div className="text-sm text-muted-foreground">
              {canDelete ? "Cancelar deja en historial; eliminar borra por completo." : "Cancelar deja en historial."}
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

function Header({ o }: { o: { code: string; status: "borrador" | "confirmada" | "cancelada"; total_amount: number; payment_status: string } }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold font-mono">{o.code}</h1>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${ORDER_STATUS_BADGE[o.status]}`}>
            {ORDER_STATUS_LABEL[o.status]}
          </span>
          {o.payment_status === "pagado" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-success/10 text-success">Pagado online</span>
          )}
          {o.payment_status === "pendiente" && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-warning/10 text-warning-foreground">Pago pendiente</span>
          )}
          <span className="text-sm text-muted-foreground">Total <span className="font-mono">{formatPrice(o.total_amount)}</span></span>
        </div>
      </div>
    </div>
  );
}
