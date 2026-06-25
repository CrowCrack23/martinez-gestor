import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { centroWeeklyReport, weekStartOf } from "@/lib/centro-closures";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, formatQty } from "@/lib/format";

type SP = Promise<{ week?: string }>;

const DOW = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

function pctDelta(current: number, prev: number): string | null {
  if (prev === 0) return null;
  const d = ((current - prev) / Math.abs(prev)) * 100;
  return `${d >= 0 ? "+" : ""}${d.toFixed(1)} %`;
}

export default async function CuadreCentroSemanalPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("cuadres");
  const sp = await searchParams;
  const weekStart = weekStartOf(sp.week || new Date().toISOString().slice(0, 10));
  const report = await centroWeeklyReport(weekStart);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cuadre semanal del centro</h1>
          <p className="text-sm text-muted-foreground">
            Semana {report.week_start} a {report.week_end}. Entregas de producción, ganancia del centro y pago a obreros.
          </p>
        </div>
        <Button asChild variant="outline"><Link href="/cuadres/centro">← Cuadre diario</Link></Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" action="/cuadres/centro/semanal">
            <div className="space-y-1">
              <Label htmlFor="week" className="text-xs">Semana (cualquier día de ella)</Label>
              <Input id="week" name="week" type="date" defaultValue={weekStart} />
            </div>
            <Button type="submit" variant="secondary" size="sm">Ver semana</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Ingreso (CUP)" value={formatPrice(report.totals.revenue_cup)}
             delta={pctDelta(report.totals.revenue_cup, report.prev_totals.revenue_cup)} />
        <Kpi label="Costo (CUP)" value={formatPrice(report.totals.cost_cup)} />
        <Kpi label="Ganancia (CUP)" value={formatPrice(report.totals.profit_cup)}
             delta={pctDelta(report.totals.profit_cup, report.prev_totals.profit_cup)} accent />
        <Kpi label="Pago obreros" value={formatPrice(report.totals.worker_pay_cup)} />
        <Kpi label="Neto (CUP)" value={formatPrice(report.totals.net_cup)}
             delta={pctDelta(report.totals.net_cup, report.prev_totals.net_cup)} accent />
      </div>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Semana anterior: ingreso {formatPrice(report.prev_totals.revenue_cup)} · ganancia{" "}
          {formatPrice(report.prev_totals.profit_cup)} · neto {formatPrice(report.prev_totals.net_cup)} ·{" "}
          {report.prev_totals.order_count} entrega{report.prev_totals.order_count === 1 ? "" : "s"}.
        </CardContent>
      </Card>

      <Card>
        <div className="px-4 pt-4 font-medium">Por día</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Día</th>
                <th className="px-4 py-3 font-medium text-right">Ganancia</th>
                <th className="px-4 py-3 font-medium text-right">Entregas</th>
              </tr>
            </thead>
            <tbody>
              {report.by_day.map((d, i) => (
                <tr key={d.day} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{DOW[i]} <span className="text-muted-foreground font-mono text-xs">{d.day}</span></td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(d.profit_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{d.order_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="px-4 pt-4 font-medium">Productos entregados</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Cant.</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso</th>
                <th className="px-4 py-3 font-medium text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {report.productions.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">Sin entregas esta semana.</td></tr>
              )}
              {report.productions.map((p) => (
                <tr key={p.production_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">{p.product_name} <span className="text-muted-foreground font-mono text-xs">{p.code}</span></td>
                  <td className="px-4 py-2 text-right font-mono">{formatQty(p.qty)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(p.revenue_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(p.profit_cup)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ label, value, accent, delta }: { label: string; value: string; accent?: boolean; delta?: string | null }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-mono font-semibold mt-1 ${accent ? "text-success" : ""}`}>{value}</div>
        {delta && <div className="text-xs text-muted-foreground mt-0.5">{delta} vs sem. ant.</div>}
      </CardContent>
    </Card>
  );
}
