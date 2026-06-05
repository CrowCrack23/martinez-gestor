import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listPointsOfSale } from "@/lib/points-of-sale";
import { weeklyReport, weekStartOf } from "@/lib/closures";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";

type SP = Promise<{ warehouse?: string; week?: string }>;

const DOW = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function pctDelta(current: number, prev: number): string | null {
  if (prev === 0) return null;
  const d = ((current - prev) / Math.abs(prev)) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)} %`;
}

export default async function CuadreSemanalPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("cuadres");
  const scope = businessScope(user);
  const [points, sp] = await Promise.all([listPointsOfSale(scope), searchParams]);
  const warehouseId = sp.warehouse && points.some((p) => p.warehouse_id === sp.warehouse)
    ? sp.warehouse
    : points[0]?.warehouse_id;
  const weekStart = weekStartOf(sp.week || new Date().toISOString().slice(0, 10));

  const report = warehouseId ? await weeklyReport(warehouseId, weekStart) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cuadre semanal</h1>
          <p className="text-sm text-muted-foreground">
            Suma de la semana, ganancia neta, comparación con la semana anterior y sugerencias.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/cuadres${warehouseId ? `?warehouse=${warehouseId}` : ""}`}>← Cuadre diario</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" action="/cuadres/semanal">
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
              <Label htmlFor="week" className="text-xs">Cualquier día de la semana</Label>
              <Input id="week" name="week" type="date" defaultValue={weekStart} />
            </div>
            <Button type="submit" variant="secondary" size="sm">Ver semana</Button>
          </form>
        </CardContent>
      </Card>

      {report && (
        <>
          <div className="text-sm text-muted-foreground">
            Semana del <span className="font-mono">{report.week_start}</span> al{" "}
            <span className="font-mono">{report.week_end}</span> — {report.warehouse_name}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="Ventas (CUP)" value={formatPrice(report.totals.revenue_cup)}
                 delta={pctDelta(report.totals.revenue_cup, report.prev_totals.revenue_cup)} />
            <Kpi label="Costo (CUP)" value={formatPrice(report.totals.cogs_cup)} />
            <Kpi label="Ganancia (CUP)" value={formatPrice(report.totals.profit_cup)}
                 delta={pctDelta(report.totals.profit_cup, report.prev_totals.profit_cup)} accent />
            <Kpi label="Pago trabajador" value={formatPrice(report.totals.commission_cup)} />
            <Kpi label="Ganancia neta" value={formatPrice(report.totals.net_cup)}
                 delta={pctDelta(report.totals.net_cup, report.prev_totals.net_cup)} accent />
          </div>

          <Card>
            <CardContent className="pt-6 text-sm">
              <div className="font-medium mb-1">Comparación con la semana anterior</div>
              <div className="text-muted-foreground">
                Anterior: ventas {formatPrice(report.prev_totals.revenue_cup)} · ganancia{" "}
                {formatPrice(report.prev_totals.profit_cup)} · neta {formatPrice(report.prev_totals.net_cup)} ·{" "}
                {report.prev_totals.order_count} venta{report.prev_totals.order_count === 1 ? "" : "s"}.
                {" "}Esta semana: {report.totals.order_count} venta{report.totals.order_count === 1 ? "" : "s"}.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              <div className="font-medium">💡 Sugerencias</div>
              {report.totals.order_count === 0 && (
                <p className="text-muted-foreground">Sin ventas esta semana: no hay sugerencias todavía.</p>
              )}
              {report.suggestions.top_seller && (
                <p>
                  📈 <span className="font-medium">{report.suggestions.top_seller.product_name}</span> es el que más
                  se vende ({report.suggestions.top_seller.qty} uds.): <span className="font-medium">trae más</span>.
                </p>
              )}
              {report.suggestions.top_profit && (
                <p>
                  💰 <span className="font-medium">{report.suggestions.top_profit.product_name}</span> es el que más
                  ganancia deja ({formatPrice(report.suggestions.top_profit.profit_cup)}): priorízalo.
                </p>
              )}
              {report.suggestions.best_day && (
                <p>
                  📅 El día que más vendes es el{" "}
                  <span className="font-medium">
                    {DOW[(new Date(`${report.suggestions.best_day.day}T00:00:00Z`).getUTCDay() + 6) % 7]}
                  </span>{" "}
                  ({report.suggestions.best_day.day}: {formatPrice(report.suggestions.best_day.revenue_cup)}): refuerza ese día.
                </p>
              )}
              {report.suggestions.bottom_seller && (
                <p>
                  📉 <span className="font-medium">{report.suggestions.bottom_seller.product_name}</span> es el que
                  menos se vende ({report.suggestions.bottom_seller.qty} uds.): considera promocionarlo o traer menos.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <div className="px-4 pt-4 font-medium">Ventas por día</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Día</th>
                    <th className="px-4 py-3 font-medium text-right">Ventas (CUP)</th>
                    <th className="px-4 py-3 font-medium text-right">Ganancia (CUP)</th>
                    <th className="px-4 py-3 font-medium text-right">Nº ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_day.map((d, i) => (
                    <tr key={d.day} className="border-b last:border-b-0">
                      <td className="px-4 py-2">
                        <span className="capitalize">{DOW[i]}</span>{" "}
                        <span className="font-mono text-xs text-muted-foreground">{d.day}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">{formatPrice(d.revenue_cup)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatPrice(d.profit_cup)}</td>
                      <td className="px-4 py-2 text-right font-mono">{d.order_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="px-4 pt-4 font-medium">Productos de la semana</div>
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
                  {report.products.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">Sin ventas esta semana.</td></tr>
                  )}
                  {report.products.map((p) => (
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
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, delta, accent }: { label: string; value: string; delta?: string | null; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono font-semibold mt-1 ${accent ? "text-success" : ""}`}>{value}</div>
        {delta && (
          <div className={`text-xs font-mono mt-0.5 ${delta.startsWith("+") ? "text-success" : "text-destructive"}`}>
            {delta} vs semana anterior
          </div>
        )}
      </CardContent>
    </Card>
  );
}
