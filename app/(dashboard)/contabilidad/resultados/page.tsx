import { requirePermission, businessScope } from "@/lib/auth";
import { incomeStatement } from "@/lib/accounting";
import { listBusinessesLite } from "@/lib/businesses";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessFilter } from "@/components/business-filter";
import { RateBanner } from "@/components/rate-banner";
import { formatPrice } from "@/lib/format";
import { formatUsd } from "@/lib/currency";
import type { TrialBalanceRow } from "@/lib/accounting";

type SP = Promise<{ from?: string; to?: string; posted?: string; business?: string }>;

// Estado de resultados dual — la utilidad que importa es la USD: cada asiento
// congela su USD a la tasa del día, así que ingresos − gastos en dólares es la
// ganancia REAL (inmune a la devaluación del CUP). La cuenta 5310 solo afecta
// el CUP (sus líneas llevan USD = 0).

export default async function ResultadosPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("contabilidad");
  const sp = await searchParams;
  const postedOnly = sp.posted !== "0";
  const scope = businessScope(user);
  const business = sp.business && (!scope || scope.includes(sp.business)) ? sp.business : undefined;
  const businesses = (await listBusinessesLite()).filter((b) => !scope || scope.includes(b.slug));
  const pl = await incomeStatement({ from: sp.from, to: sp.to, postedOnly, scope, business });

  const selected = business ? businesses.find((b) => b.slug === business)?.label : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Estado de resultados</h1>
        <p className="text-sm text-muted-foreground">
          Ingresos, gastos y utilidad del período en USD (real, congelado por operación) y CUP.
          {" "}{selected ? `Negocio: ${selected}.` : "Consolidado (todos los negocios)."}
          {" "}Por defecto solo asientos contabilizados.
        </p>
      </div>
      <RateBanner />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {businesses.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Negocio</Label>
                <BusinessFilter businesses={businesses} />
              </div>
            )}
            <form className="flex flex-wrap items-end gap-3 text-sm" action="/contabilidad/resultados">
              <input type="hidden" name="business" value={business ?? ""} />
              <div className="space-y-1"><Label htmlFor="from" className="text-xs">Desde</Label><Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} /></div>
              <div className="space-y-1"><Label htmlFor="to" className="text-xs">Hasta</Label><Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} /></div>
              <label className="flex items-center gap-2 px-2 h-10">
                <input type="checkbox" name="posted" value="0" defaultChecked={!postedOnly} className="size-4" />
                Incluir borradores
              </label>
              <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Section title="Ingresos" rows={pl.income} total={pl.totalIncome} totalUsd={pl.totalIncomeUsd} />
      <Section title="Gastos" rows={pl.expense} total={pl.totalExpense} totalUsd={pl.totalExpenseUsd} />

      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <div className="font-medium">Utilidad neta</div>
            <div className="text-xs text-muted-foreground">USD = ganancia real (moneda rectora)</div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-mono font-semibold ${pl.netIncomeUsd < 0 ? "text-destructive" : "text-success"}`}>
              {formatUsd(pl.netIncomeUsd)}
            </div>
            <div className={`text-sm font-mono ${pl.netIncome < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {formatPrice(pl.netIncome)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, rows, total, totalUsd }: { title: string; rows: TrialBalanceRow[]; total: number; totalUsd: number }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium" colSpan={2}>{title}</th>
              <th className="px-4 py-3 font-medium text-right">USD</th>
              <th className="px-4 py-3 font-medium text-right">CUP</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 text-center text-muted-foreground text-xs">Sin movimientos.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.account_id} className="border-b last:border-b-0">
                <td className="px-4 py-2 font-mono text-xs">{r.account_code}</td>
                <td className="px-4 py-2">{r.account_name}</td>
                <td className="px-4 py-2 text-right font-mono font-medium">{formatUsd(r.balance_usd)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{formatPrice(r.balance)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-medium border-t">
                <td colSpan={2} className="px-4 py-2">Total {title}</td>
                <td className="px-4 py-2 text-right font-mono">{formatUsd(totalUsd)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{formatPrice(total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
