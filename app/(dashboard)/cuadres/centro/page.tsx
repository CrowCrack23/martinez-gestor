import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { previewCentroDaily, listCentroClosures } from "@/lib/centro-closures";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flash } from "@/components/flash";
import { formatPrice, formatQty } from "@/lib/format";
import { confirmCentroDailyAction, reopenCentroDailyAction } from "./actions";

type SP = Promise<{ day?: string; error?: string; success?: string }>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function CuadreCentroPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("cuadres");
  const sp = await searchParams;
  const day = sp.day || today();
  const [preview, history] = await Promise.all([previewCentroDaily(day), listCentroClosures(30)]);
  const isAdmin = user.roles.includes("admin");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cuadre del centro de elaboración</h1>
          <p className="text-sm text-muted-foreground">
            Entregas de producción del día al almacén central: ingreso del centro (precio de transferencia),
            costo, ganancia y el {preview.worker_pct}% que se paga a los obreros. Al confirmar se congela y se
            registra el pago a obreros.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/cuadres/centro/semanal">Cuadre semanal →</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" action="/cuadres/centro">
            <div className="space-y-1">
              <Label htmlFor="day" className="text-xs">Día</Label>
              <Input id="day" name="day" type="date" defaultValue={day} />
            </div>
            <Button type="submit" variant="secondary" size="sm">Ver cuadre</Button>
            <Button asChild variant="ghost" size="sm"><Link href="/cuadres">← Cuadre de ventas</Link></Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Ingreso del centro" value={formatPrice(preview.revenue_cup)} />
        <Kpi label="Costo de insumos" value={formatPrice(preview.cost_cup)} />
        <Kpi label="Ganancia (CUP)" value={formatPrice(preview.profit_cup)} accent />
        <Kpi label={`Pago obreros (${preview.worker_pct} %)`} value={formatPrice(preview.worker_pay_cup)} />
        <Kpi label="Neto del día (CUP)" value={formatPrice(preview.net_cup)} accent />
      </div>

      <Card>
        <div className="px-4 pt-4 font-medium">
          Producciones entregadas ({preview.order_count})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium text-right">Cant.</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {preview.productions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">Sin entregas de producción ese día.</td></tr>
              )}
              {preview.productions.map((p) => (
                <tr key={p.production_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-2">{p.product_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatQty(p.qty)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(p.revenue_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(p.cost_cup)}</td>
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
            <div>✅ El cuadre del centro de este día ya está confirmado (ver historial abajo).</div>
            {isAdmin && (
              <form action={reopenCentroDailyAction.bind(null, day)}>
                <Button type="submit" variant="destructive" size="sm">Reabrir cuadre</Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : (
        preview.order_count > 0 && (
          <Card>
            <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <div className="font-medium">Confirmar cuadre del {day}</div>
                <div className="text-sm text-muted-foreground">
                  Congela las cifras y registra el pago a los obreros ({formatPrice(preview.worker_pay_cup)}) en el libro del centro.
                </div>
              </div>
              <form action={confirmCentroDailyAction.bind(null, day)}><Button type="submit">Confirmar cuadre</Button></form>
            </CardContent>
          </Card>
        )
      )}

      <Card>
        <div className="px-4 pt-4 font-medium">Historial de cuadres del centro</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Día</th>
                <th className="px-4 py-3 font-medium text-right">Ingreso</th>
                <th className="px-4 py-3 font-medium text-right">Costo</th>
                <th className="px-4 py-3 font-medium text-right">Ganancia</th>
                <th className="px-4 py-3 font-medium text-right">Pago obreros</th>
                <th className="px-4 py-3 font-medium text-right">Neto</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">Aún no hay cuadres del centro confirmados.</td></tr>
              )}
              {history.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{c.day}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.revenue_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.cost_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.profit_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.worker_pay_cup)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(c.net_cup)}</td>
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
