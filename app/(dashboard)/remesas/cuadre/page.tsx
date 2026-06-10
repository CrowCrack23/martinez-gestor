import Link from "next/link";
import { hasRole, requirePermission } from "@/lib/auth";
import { weekStartOf } from "@/lib/closures";
import { listWeeklyClosures, previewWeeklyClosure } from "@/lib/remittance-closures";
import { REM_BUSINESS_LABEL } from "@/lib/remittances";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { confirmRemittanceClosureAction, markRemittancePartnerPaidAction, reopenRemittanceClosureAction } from "./actions";

type SP = Promise<{ business?: string; week?: string; error?: string; success?: string }>;

const BUSINESSES = ["remesas_eeuu", "remesas_europa"] as const;
type RemBusiness = (typeof BUSINESSES)[number];

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  confirmada: "Confirmada",
  pagada_parcial: "Pagada parcial",
  pagada: "Pagada",
};

export default async function CuadreRemesasPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("remesas");
  const sp = await searchParams;
  const isAdmin = hasRole(user, ["admin"]);
  const business: RemBusiness = BUSINESSES.includes(sp.business as RemBusiness)
    ? (sp.business as RemBusiness)
    : "remesas_eeuu";
  const today = new Date().toISOString().slice(0, 10);
  const week = sp.week || weekStartOf(today);

  const [preview, history] = await Promise.all([
    previewWeeklyClosure(business, week),
    listWeeklyClosures(business),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Cuadre semanal de remesas</h1>
          <p className="text-sm text-muted-foreground">
            Remesas entregadas, ganancia (comisiones + diferencia de tasas), pago de mensajeros
            {business === "remesas_europa" ? " y reparto entre socios" : ""}.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/remesas">← Remesas</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="business" className="text-xs">Negocio</Label>
          <Select id="business" name="business" defaultValue={business}>
            {BUSINESSES.map((b) => (
              <option key={b} value={b}>{REM_BUSINESS_LABEL[b]}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="week" className="text-xs">Semana (lunes)</Label>
          <Input id="week" name="week" type="date" defaultValue={week} className="w-44" />
        </div>
        <Button type="submit" variant="outline" size="sm">Ver</Button>
      </form>

      {/* KPIs de la semana */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Entregadas" value={String(preview.delivered_count)} />
        <Kpi label="Comisiones" value={`${fmt(preview.commissions_cup)} CUP`} />
        <Kpi label="Diferencia de tasas" value={`${fmt(preview.spread_cup)} CUP`} />
        <Kpi label="Ganancia" value={`${fmt(preview.profit_cup)} CUP`} />
        <Kpi label="Pago mensajeros" value={`${fmt(preview.courier_pay_cup)} CUP`} />
        <Kpi label="Neto" value={`${fmt(preview.net_cup)} CUP`} />
      </div>

      {/* Reparto socios (Europa) */}
      {preview.partner_lines.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="px-4 py-3 font-medium">Socio</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-4 py-3 font-medium text-right">Le toca (del neto)</th>
                </tr>
              </thead>
              <tbody>
                {preview.partner_lines.map((l) => (
                  <tr key={l.partner_id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{l.partner_name}</td>
                    <td className="px-4 py-3 text-right font-mono">{l.profit_pct.toFixed(2)} %</td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {business === "remesas_europa" && preview.partner_lines.length === 0 && (
        <div className="rounded-md border px-4 py-3 text-sm bg-warning/10">
          Remesas Europa no tiene socios registrados. Créelos (50/50) en{" "}
          <Link href="/socios?business=remesas_europa" className="underline">Socios</Link>.
        </div>
      )}

      {isAdmin && !preview.already_closed && preview.delivered_count > 0 && (
        <form action={confirmRemittanceClosureAction}>
          <input type="hidden" name="business_slug" value={business} />
          <input type="hidden" name="week_start" value={week} />
          <Button type="submit">Confirmar cuadre de la semana {week}</Button>
        </form>
      )}
      {preview.already_closed && (
        <div className="rounded-md border px-4 py-3 text-sm bg-success/10 text-success">
          El cuadre de esta semana ya está confirmado.
        </div>
      )}

      {/* Historial */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Historial</h2>
        <div className="space-y-4">
          {history.length === 0 && <p className="text-sm text-muted-foreground">Sin cuadres confirmados.</p>}
          {history.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">
                    Semana {c.week_start} — {c.delivered_count} entregadas · ganancia {fmt(c.profit_cup)} CUP
                    <span className="text-muted-foreground text-xs ml-2">
                      (comisiones {fmt(c.commissions_cup)} · tasas {fmt(c.spread_cup)} · mensajeros −{fmt(c.courier_pay_cup)} · neto {fmt(c.net_cup)})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${c.status === "pagada" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                    {isAdmin && (
                      <form action={reopenRemittanceClosureAction.bind(null, business, c.week_start)} className="inline">
                        <Button type="submit" variant="destructive" size="sm">Reabrir</Button>
                      </form>
                    )}
                  </div>
                </div>
                {c.lines.length > 0 && (
                  <table className="w-full text-sm">
                    <tbody>
                      {c.lines.map((l) => {
                        const pay = markRemittancePartnerPaidAction.bind(null, l.id, business, week);
                        return (
                          <tr key={l.id} className="border-b last:border-b-0">
                            <td className="py-2">{l.partner_name}</td>
                            <td className="py-2 text-right font-mono">{l.profit_pct.toFixed(2)} %</td>
                            <td className="py-2 text-right font-mono">{fmt(l.amount)}</td>
                            <td className="py-2 text-right">
                              {l.paid_at ? (
                                <span className="text-xs text-success">Pagado {l.paid_at}</span>
                              ) : isAdmin ? (
                                <form action={pay} className="inline-flex items-center gap-2 justify-end">
                                  <Input name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-40 h-8" required />
                                  <Button type="submit" variant="outline" size="sm">Registrar pago</Button>
                                </form>
                              ) : (
                                <span className="text-xs text-muted-foreground">Pendiente</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
