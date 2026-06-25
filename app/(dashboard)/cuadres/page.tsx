import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listPointsOfSale } from "@/lib/points-of-sale";
import { previewDailyClosure, listDailyClosures } from "@/lib/closures";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";
import { confirmDailyClosureAction, reopenDailyClosureAction } from "./actions";

type SP = Promise<{ warehouse?: string; day?: string; error?: string; success?: string }>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function CuadresPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("cuadres");
  const scope = businessScope(user);
  const [points, sp] = await Promise.all([listPointsOfSale(scope), searchParams]);
  const day = sp.day || today();
  const warehouseId = sp.warehouse && points.some((p) => p.warehouse_id === sp.warehouse)
    ? sp.warehouse
    : points[0]?.warehouse_id;

  const [preview, history] = await Promise.all([
    warehouseId ? previewDailyClosure(warehouseId, day) : Promise.resolve(null),
    listDailyClosures({ warehouseId, scope, limit: 30 }),
  ]);

  const confirm = warehouseId ? confirmDailyClosureAction.bind(null, warehouseId, day) : null;
  const isAdmin = user.roles.includes("admin");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cuadre diario</h1>
          <p className="text-sm text-muted-foreground">
            Ventas del día por punto de venta: productos vendidos, costo en CUP y USD, pago del trabajador
            y desglose del dinero. Al confirmar se congela y se descuenta la comisión.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/cuadres/centro">Cuadre del centro →</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/cuadres/semanal${warehouseId ? `?warehouse=${warehouseId}` : ""}`}>Cuadre semanal →</Link>
          </Button>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" action="/cuadres">
            <div className="space-y-1">
              <Label htmlFor="warehouse" className="text-xs">Punto de venta</Label>
              <Select id="warehouse" name="warehouse" defaultValue={warehouseId ?? ""}>
                {points.length === 0 && <option value="">— Sin puntos de venta —</option>}
                {points.map((p) => (
                  <option key={p.warehouse_id} value={p.warehouse_id}>{p.warehouse_name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="day" className="text-xs">Día</Label>
              <Input id="day" name="day" type="date" defaultValue={day} />
            </div>
            <Button type="submit" variant="secondary" size="sm">Ver cuadre</Button>
          </form>
        </CardContent>
      </Card>

      {!warehouseId && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No hay puntos de venta. Crea un almacén tipo &quot;Punto de venta&quot; en{" "}
            <Link href="/almacenes" className="underline">Almacenes</Link> y asígnale trabajador en{" "}
            <Link href="/puntos-venta" className="underline">Puntos de venta</Link>.
          </CardContent>
        </Card>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Ventas (CUP)" value={formatPrice(preview.revenue_cup)} />
            <Kpi
              label="Costo (CUP / USD)"
              value={`${formatPrice(preview.cogs_cup)}${preview.rate_used ? ` / $${preview.cogs_usd.toFixed(2)}` : ""}`}
            />
            <Kpi label="Ganancia (CUP)" value={formatPrice(preview.profit_cup)} accent />
            <Kpi
              label={`Pago trabajador (${preview.commission_pct.toFixed(2)} %)`}
              value={formatPrice(preview.commission_cup)}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Efectivo CUP" value={formatPrice(preview.cash_cup)} />
            <Kpi label="Transferencia" value={formatPrice(preview.transfer_cup)} />
            <Kpi label="USD en caja" value={`$${preview.usd_total.toFixed(2)}`} />
            <Kpi label="Neto del día (CUP)" value={formatPrice(preview.net_cup)} accent />
          </div>

          <Card>
            <div className="px-4 pt-4 font-medium">Productos vendidos ({preview.order_count} venta{preview.order_count === 1 ? "" : "s"})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium text-right">Cant.</th>
                    <th className="px-4 py-3 font-medium text-right">Ventas (CUP)</th>
                    <th className="px-4 py-3 font-medium text-right">Ganancia (CUP)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.products.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">Sin ventas confirmadas ese día.</td></tr>
                  )}
                  {preview.products.map((p) => (
                    <tr key={p.product_id} className="border-b last:border-b-0">
                      <td className="px-4 py-2">{p.product_name}</td>
                      <td className="px-4 py-2 text-right font-mono">{p.qty}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatPrice(p.revenue_cup)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatPrice(p.profit_cup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {preview.already_closed ? (
            <Card>
              <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between text-sm">
                <div>✅ El cuadre de este día ya está confirmado (ver historial abajo).</div>
                {isAdmin && warehouseId && (
                  <form action={reopenDailyClosureAction.bind(null, warehouseId, day)}>
                    <Button type="submit" variant="destructive" size="sm">Reabrir cuadre</Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : (
            preview.order_count > 0 && confirm && (
              <Card>
                <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <div className="font-medium">Confirmar cuadre del {day}</div>
                    <div className="text-sm text-muted-foreground">
                      Congela las cifras, registra el pago del trabajador ({formatPrice(preview.commission_cup)}) y
                      genera los asientos contables.
                      {!preview.staff_user_id && " ⚠ Este punto no tiene trabajador asignado: la comisión será 0."}
                    </div>
                  </div>
                  <form action={confirm}><Button type="submit">Confirmar cuadre</Button></form>
                </CardContent>
              </Card>
            )
          )}
        </>
      )}

      <Card>
        <div className="px-4 pt-4 font-medium">Historial de cuadres</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Día</th>
                <th className="px-4 py-3 font-medium">Punto</th>
                <th className="px-4 py-3 font-medium text-right">Ventas</th>
                <th className="px-4 py-3 font-medium text-right">Ganancia</th>
                <th className="px-4 py-3 font-medium text-right">Comisión</th>
                <th className="px-4 py-3 font-medium text-right">Efectivo</th>
                <th className="px-4 py-3 font-medium text-right">Transf.</th>
                <th className="px-4 py-3 font-medium text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground text-xs">Aún no hay cuadres confirmados.</td></tr>
              )}
              {history.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{c.day}</td>
                  <td className="px-4 py-2">{c.warehouse_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.revenue_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.profit_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.commission_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.cash_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.transfer_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">${c.usd_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono font-semibold mt-1 ${accent ? "text-success" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
