import { requirePermission } from "@/lib/auth";
import { listBusinessesLite } from "@/lib/businesses";
import { capitalSnapshot, listFixedAssets } from "@/lib/capital";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { addFixedAssetAction } from "./actions";

type SP = Promise<{ business?: string; error?: string; success?: string }>;

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CapitalPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("capital");
  const sp = await searchParams;
  const businesses = await listBusinessesLite();
  const business = sp.business || businesses.find((b) => b.slug === "mipyme")?.slug || businesses[0]?.slug || "";
  const [snapshot, assets] = await Promise.all([capitalSnapshot(business), listFixedAssets(business)]);
  const today = new Date().toISOString().slice(0, 10);
  const isAdmin = user.roles.includes("admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Capital</h1>
        <p className="text-sm text-muted-foreground">
          Dónde está el capital del negocio en este momento: dinero en movimiento (efectivo, inventario,
          cuentas por cobrar) e infraestructura (inversión fija).
        </p>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <form method="get" className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="business" className="text-xs">Negocio</Label>
          <Select id="business" name="business" defaultValue={business}>
            {businesses.map((b) => (
              <option key={b.slug} value={b.slug}>{b.label}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm">Ver</Button>
      </form>

      {/* Totales */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Capital total</div>
            <div className="text-2xl font-semibold">{fmt(snapshot.capitalTotal)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Dinero en movimiento</div>
            <div className="text-2xl font-semibold">{fmt(snapshot.moving)} CUP</div>
            <div className="text-xs text-muted-foreground">Efectivo + inventario + CxC − CxP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Infraestructura (fija)</div>
            <div className="text-2xl font-semibold">{fmt(snapshot.infrastructure)} CUP</div>
            <div className="text-xs text-muted-foreground">{assets.length} inversión(es) registrada(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Desglose dinero en movimiento */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Efectivo</div>
            <div className="text-xl font-semibold">{fmt(snapshot.cash.total)} CUP</div>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
              <div>Caja CUP: {fmt(snapshot.cash.cup)}</div>
              <div>Caja USD (en CUP): {fmt(snapshot.cash.usd)}</div>
              <div>Banco: {fmt(snapshot.cash.bank)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Inventario (FIFO)</div>
            <div className="text-xl font-semibold">{fmt(snapshot.inventory.total)} CUP</div>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
              <div>Insumos / elaboración: {fmt(snapshot.inventory.centro)}</div>
              <div>Almacén central: {fmt(snapshot.inventory.almacen)}</div>
              <div>En puntos de venta: {fmt(snapshot.inventory.puntos)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cuentas por cobrar</div>
            <div className="text-xl font-semibold">{fmt(snapshot.receivables)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cuentas por pagar</div>
            <div className="text-xl font-semibold text-destructive">−{fmt(snapshot.payables)} CUP</div>
          </CardContent>
        </Card>
      </div>

      {/* Inventario por almacén */}
      {snapshot.inventory.byWarehouse.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Almacén / punto</th>
                  <th className="px-4 py-3 font-medium text-right">Valor del inventario</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.inventory.byWarehouse.map((w) => (
                  <tr key={w.warehouse_id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{w.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(w.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Infraestructura */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="font-medium">Infraestructura</div>
          {isAdmin && (
            <form action={addFixedAssetAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="business_slug" value={business} />
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Descripción</Label>
                <Input id="name" name="name" placeholder="Ej: nevera, local, mobiliario" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="amount" className="text-xs">Monto (CUP)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0.01" className="w-36" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="acquired_at" className="text-xs">Fecha</Label>
                <Input id="acquired_at" name="acquired_at" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">Notas</Label>
                <Input id="notes" name="notes" placeholder="Opcional" />
              </div>
              <Button type="submit" size="sm">Registrar inversión</Button>
            </form>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Descripción</th>
                  <th className="px-4 py-3 font-medium text-right">Monto</th>
                  <th className="px-4 py-3 font-medium">Notas</th>
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">
                      Sin inversiones en infraestructura registradas.
                    </td>
                  </tr>
                )}
                {assets.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{a.acquired_at}</td>
                    <td className="px-4 py-3">{a.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(a.amount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
