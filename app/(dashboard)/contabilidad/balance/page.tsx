import { requirePermission, businessScope } from "@/lib/auth";
import { trialBalance, ACCOUNT_TYPE_LABEL } from "@/lib/accounting";
import { listBusinessesLite } from "@/lib/businesses";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BusinessFilter } from "@/components/business-filter";
import { RateBanner } from "@/components/rate-banner";
import { formatPrice } from "@/lib/format";
import { formatUsd } from "@/lib/currency";
import type { AccountType } from "@/lib/supabase-types";

type SP = Promise<{ from?: string; to?: string; posted?: string; business?: string }>;

// Balance dual — USD funcional: la columna rectora es el saldo USD CONGELADO
// por transacción (no una conversión a tasa de hoy); el CUP acompaña.

export default async function BalancePage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("contabilidad");
  const sp = await searchParams;
  const postedOnly = sp.posted !== "0";
  const scope = businessScope(user);
  const business = sp.business && (!scope || scope.includes(sp.business)) ? sp.business : undefined;
  const businesses = (await listBusinessesLite()).filter((b) => !scope || scope.includes(b.slug));
  const rows = await trialBalance({ from: sp.from, to: sp.to, postedOnly, scope, business });

  const groups: Record<AccountType, typeof rows> = {
    activo: [], pasivo: [], patrimonio: [], ingreso: [], gasto: [],
  };
  for (const r of rows) groups[r.type].push(r);

  const sumCup = (list: typeof rows) => list.reduce((s, r) => s + r.balance, 0);
  const sumUsd = (list: typeof rows) => list.reduce((s, r) => s + r.balance_usd, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Balance de comprobación</h1>
        <p className="text-sm text-muted-foreground">
          Saldos en USD (moneda rectora, congelados a la tasa del día de cada operación) y en CUP.
          Por defecto solo asientos contabilizados.
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
            <form className="flex flex-wrap items-end gap-3 text-sm" action="/contabilidad/balance">
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

      {(Object.entries(groups) as [AccountType, typeof rows][]).map(([t, list]) => (
        <Card key={t}>
          <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium" colSpan={2}>{ACCOUNT_TYPE_LABEL[t]}</th>
                <th className="px-4 py-3 font-medium text-right">Saldo USD</th>
                <th className="px-4 py-3 font-medium text-right">Saldo CUP</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-3 text-center text-muted-foreground text-xs">Sin movimientos.</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.account_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{r.account_code}</td>
                  <td className="px-4 py-2">{r.account_name}</td>
                  <td className={`px-4 py-2 text-right font-mono font-medium ${r.balance_usd < 0 ? "text-destructive" : ""}`}>
                    {formatUsd(r.balance_usd)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono text-muted-foreground ${r.balance < 0 ? "text-destructive" : ""}`}>
                    {formatPrice(r.balance)}
                  </td>
                </tr>
              ))}
              {list.length > 0 && (
                <tr className="font-medium border-t">
                  <td colSpan={2} className="px-4 py-2">Subtotal {ACCOUNT_TYPE_LABEL[t]}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatUsd(sumUsd(list))}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">{formatPrice(sumCup(list))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Card>
      ))}
    </div>
  );
}
