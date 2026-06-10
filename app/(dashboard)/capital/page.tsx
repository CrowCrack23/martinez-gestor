import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBusinessesLite } from "@/lib/businesses";
import { capitalSnapshot, listCashMovements, listFixedAssets } from "@/lib/capital";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { RateBanner } from "@/components/rate-banner";
import { formatUsd } from "@/lib/currency";
import { JOURNAL_STATUS_LABEL } from "@/lib/accounting";
import { addFixedAssetAction, deleteCashMovementAction, deleteFixedAssetAction, recordCashMovementAction } from "./actions";

type SP = Promise<{ business?: string; error?: string; success?: string }>;

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function CapitalPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("capital");
  const sp = await searchParams;
  const businesses = await listBusinessesLite();
  const business = sp.business || businesses.find((b) => b.slug === "mipyme")?.slug || businesses[0]?.slug || "";
  const isAdmin = user.roles.includes("admin");
  const canRecord = isAdmin || user.roles.includes("contador");
  const [snapshot, assets, cashMovements] = await Promise.all([
    capitalSnapshot(business),
    listFixedAssets(business),
    canRecord ? listCashMovements(business) : Promise.resolve([]),
  ]);
  const today = new Date().toISOString().slice(0, 10);

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

      <RateBanner />

      {/* Totales — el dólar es la moneda rectora; cifras USD congeladas por operación */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Capital total (USD)</div>
            <div className="text-2xl font-semibold">{formatUsd(snapshot.capitalTotalUsd)}</div>
            <div className="text-xs text-muted-foreground">USD real, congelado por operación</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Capital total (CUP)</div>
            <div className="text-2xl font-semibold">{fmt(snapshot.capitalTotal)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Dinero en movimiento</div>
            <div className="text-2xl font-semibold">{formatUsd(snapshot.movingUsd)}</div>
            <div className="text-xs text-muted-foreground">
              Efectivo + inventario + CxC − CxP · {fmt(snapshot.moving)} CUP
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Infraestructura (fija)</div>
            <div className="text-2xl font-semibold">{formatUsd(snapshot.infrastructureUsd)}</div>
            <div className="text-xs text-muted-foreground">{fmt(snapshot.infrastructure)} CUP · {assets.length} inversión(es)</div>
          </CardContent>
        </Card>
      </div>

      {/* Capital aportado por socios */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Capital aportado por socios</div>
            <div className="text-xl font-semibold">{fmt(snapshot.contributed.total)} CUP</div>
            <div className="text-xs text-muted-foreground">
              Aportes: {fmt(snapshot.contributed.cup)} CUP + {fmt(snapshot.contributed.usd)} USD
            </div>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/socios/aportes">Ver aportes</Link></Button>
        </CardContent>
      </Card>

      {/* Desglose dinero en movimiento */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Efectivo</div>
            <div className="text-xl font-semibold">{formatUsd(snapshot.cash.totalUsd)}</div>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
              <div>Caja CUP: {fmt(snapshot.cash.cup)} CUP</div>
              <div>
                Caja USD: {fmt(snapshot.cash.usd)} USD
                {snapshot.cash.usdCup != null ? ` (≈ ${fmt(snapshot.cash.usdCup)} CUP hoy)` : ""}
              </div>
              <div>Banco: {fmt(snapshot.cash.bank)} CUP</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Inventario (FIFO)</div>
            <div className="text-xl font-semibold">{formatUsd(snapshot.inventory.totalUsd)}</div>
            <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
              <div>Total: {fmt(snapshot.inventory.total)} CUP</div>
              <div>Insumos / elaboración: {fmt(snapshot.inventory.centro)}</div>
              <div>Almacén central: {fmt(snapshot.inventory.almacen)}</div>
              <div>En puntos de venta: {fmt(snapshot.inventory.puntos)}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cuentas por cobrar</div>
            <div className="text-xl font-semibold">{formatUsd(snapshot.receivablesUsd)}</div>
            <div className="text-xs text-muted-foreground">{fmt(snapshot.receivables)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cuentas por pagar</div>
            <div className="text-xl font-semibold text-destructive">−{formatUsd(snapshot.payablesUsd)}</div>
            <div className="text-xs text-muted-foreground">−{fmt(snapshot.payables)} CUP</div>
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
                  <th className="px-4 py-3 font-medium text-right">Valor USD</th>
                  <th className="px-4 py-3 font-medium text-right">Valor CUP</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.inventory.byWarehouse.map((w) => (
                  <tr key={w.warehouse_id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{w.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{formatUsd(w.valueUsd)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmt(w.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Ingresos y gastos manuales */}
      {canRecord && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <div className="font-medium">Registrar ingreso o gasto</div>
              <div className="text-sm text-muted-foreground">
                Entra o sale dinero de la caja del negocio y se refleja automáticamente en el capital y la contabilidad.
              </div>
            </div>
            <form action={recordCashMovementAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="business_slug" value={business} />
              <div className="space-y-1">
                <Label htmlFor="kind" className="text-xs">Tipo</Label>
                <Select id="kind" name="kind" defaultValue="ingreso" className="w-32">
                  <option value="ingreso">Ingreso</option>
                  <option value="gasto">Gasto</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mov_amount" className="text-xs">Monto</Label>
                <Input id="mov_amount" name="amount" type="number" step="0.01" min="0.01" className="w-32" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mov_currency" className="text-xs">Moneda</Label>
                <Select id="mov_currency" name="currency" defaultValue="CUP" className="w-24">
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="concept" className="text-xs">Concepto</Label>
                <Input id="concept" name="concept" placeholder="Ej: alquiler, venta informal" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mov_date" className="text-xs">Fecha</Label>
                <Input id="mov_date" name="date" type="date" defaultValue={today} required />
              </div>
              <Button type="submit" size="sm">Registrar</Button>
            </form>

            {cashMovements.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="text-left text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Concepto</th>
                      <th className="px-4 py-3 font-medium text-right">Monto (CUP)</th>
                      <th className="px-4 py-3 font-medium">Estado</th>
                      <th className="px-4 py-3 font-medium text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashMovements.map((m) => (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3">{m.entry_date}</td>
                        <td className="px-4 py-3">{m.description}</td>
                        <td className="px-4 py-3 text-right font-mono">{fmt(m.amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{JOURNAL_STATUS_LABEL[m.status]}</td>
                        <td className="px-4 py-3 text-right">
                          {m.status === "contabilizada" ? (
                            <span className="text-xs text-muted-foreground">Contabilizado</span>
                          ) : (
                            <form action={deleteCashMovementAction.bind(null, m.id, business)} className="inline">
                              <Button type="submit" variant="destructive" size="sm">Eliminar</Button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
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
                  {isAdmin && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground text-xs">
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
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <form action={deleteFixedAssetAction.bind(null, a.id, business)} className="inline">
                          <Button type="submit" variant="destructive" size="sm">Eliminar</Button>
                        </form>
                      </td>
                    )}
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
