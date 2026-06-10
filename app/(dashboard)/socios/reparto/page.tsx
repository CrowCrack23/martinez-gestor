import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBusinessesLite } from "@/lib/businesses";
import { listDistributions, previewDistribution } from "@/lib/profit-sharing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { confirmDistributionAction, markPartnerPaidAction, reopenDistributionAction } from "./actions";

type SP = Promise<{ business?: string; month?: string; drafts?: string; error?: string; success?: string }>;

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  calculada: "Calculada",
  pagada_parcial: "Pagada parcial",
  pagada: "Pagada",
};

export default async function RepartoPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("socios");
  const sp = await searchParams;
  const businesses = await listBusinessesLite();
  const business = sp.business || businesses.find((b) => b.slug === "mipyme")?.slug || businesses[0]?.slug || "";
  const month = sp.month || new Date().toISOString().slice(0, 7);
  const includeDrafts = sp.drafts !== "0";
  const today = new Date().toISOString().slice(0, 10);

  const [preview, history] = await Promise.all([
    previewDistribution(business, month, includeDrafts),
    listDistributions(business),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Reparto mensual</h1>
          <p className="text-sm text-muted-foreground">
            El sistema calcula cuánto toca a cada socio según la ganancia del mes; usted registra cuándo
            efectúa cada pago.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={`/socios?business=${business}`}>← Socios</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="business" className="text-xs">Negocio</Label>
          <Select id="business" name="business" defaultValue={business}>
            {businesses.map((b) => (
              <option key={b.slug} value={b.slug}>{b.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="month" className="text-xs">Mes</Label>
          <Input id="month" name="month" type="month" defaultValue={month} className="w-44" />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" name="drafts" value="1" defaultChecked={includeDrafts} className="accent-primary" />
          Incluir borradores
        </label>
        <Button type="submit" variant="outline" size="sm">Calcular</Button>
      </form>

      {/* Preview del mes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Ganancia del mes</div>
            <div className={`text-2xl font-semibold ${preview.base_profit < 0 ? "text-destructive" : ""}`}>
              {fmt(preview.base_profit)} CUP
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Para la empresa ({preview.growth_pct.toFixed(2)} %)</div>
            <div className="text-2xl font-semibold">{fmt(preview.growth_amount)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Para los socios</div>
            <div className="text-2xl font-semibold">{fmt(preview.distributable)} CUP</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Estado</div>
            <div className="text-2xl font-semibold">
              {preview.already_confirmed ? "Confirmado" : "Sin confirmar"}
            </div>
          </CardContent>
        </Card>
      </div>

      {!preview.percentages_ok && (
        <div className="rounded-md border px-4 py-3 text-sm bg-destructive/10 text-destructive">
          Los % de socios + crecimiento no suman 100. Ajústelos en{" "}
          <Link href={`/socios?business=${business}`} className="underline">Socios</Link> antes de confirmar.
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Socio</th>
                <th className="px-4 py-3 font-medium text-right">%</th>
                <th className="px-4 py-3 font-medium text-right">Le toca</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    Sin socios activos en este negocio.
                  </td>
                </tr>
              )}
              {preview.lines.map((l) => (
                <tr key={l.partner_id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{l.partner_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{l.profit_pct.toFixed(2)} %</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!preview.already_confirmed && preview.lines.length > 0 && preview.base_profit > 0 && preview.percentages_ok && (
          <CardContent className="border-t pt-4">
            <form action={confirmDistributionAction}>
              <input type="hidden" name="business_slug" value={business} />
              <input type="hidden" name="month" value={month} />
              {includeDrafts && <input type="hidden" name="include_drafts" value="on" />}
              <Button type="submit" size="sm">Confirmar reparto de {month}</Button>
            </form>
          </CardContent>
        )}
      </Card>

      {/* Historial */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Historial de repartos</h2>
        <div className="space-y-4">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin repartos confirmados.</p>
          )}
          {history.map((d) => (
            <Card key={d.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    {d.period_month.slice(0, 7)} — ganancia {fmt(d.base_profit)} CUP
                    <span className="text-muted-foreground text-xs ml-2">
                      (empresa {d.growth_pct.toFixed(2)} % = {fmt(d.growth_amount)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${d.status === "pagada" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                    <form action={reopenDistributionAction.bind(null, business, d.period_month.slice(0, 7))} className="inline">
                      <Button type="submit" variant="destructive" size="sm">Reabrir</Button>
                    </form>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {d.lines.map((l) => {
                      const pay = markPartnerPaidAction.bind(null, l.id, business, month);
                      return (
                        <tr key={l.id} className="border-b last:border-b-0">
                          <td className="py-2">{l.partner_name}</td>
                          <td className="py-2 text-right font-mono">{l.profit_pct.toFixed(2)} %</td>
                          <td className="py-2 text-right font-mono">{fmt(l.amount)}</td>
                          <td className="py-2 text-right">
                            {l.paid_at ? (
                              <span className="text-xs text-success">Pagado {l.paid_at}</span>
                            ) : (
                              <form action={pay} className="inline-flex items-center gap-2 justify-end">
                                <Input name="paid_at" type="date" defaultValue={today} className="w-40 h-8" required />
                                <Button type="submit" variant="outline" size="sm">Registrar pago</Button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
