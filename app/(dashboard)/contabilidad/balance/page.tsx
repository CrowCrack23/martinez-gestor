import { requirePermission } from "@/lib/auth";
import { trialBalance, ACCOUNT_TYPE_LABEL } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";
import type { AccountType } from "@/lib/supabase-types";

type SP = Promise<{ from?: string; to?: string; posted?: string }>;

export default async function BalancePage({ searchParams }: { searchParams: SP }) {
  await requirePermission("contabilidad");
  const sp = await searchParams;
  const postedOnly = sp.posted !== "0";
  const rows = await trialBalance({ from: sp.from, to: sp.to, postedOnly });

  const groups: Record<AccountType, typeof rows> = {
    activo: [], pasivo: [], patrimonio: [], ingreso: [], gasto: [],
  };
  for (const r of rows) groups[r.type].push(r);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Balance de comprobación</h1>
        <p className="text-sm text-muted-foreground">Saldo por cuenta. Por defecto solo asientos contabilizados.</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3 text-sm" action="/contabilidad/balance">
            <div className="space-y-1"><Label htmlFor="from" className="text-xs">Desde</Label><Input id="from" name="from" type="date" defaultValue={sp.from ?? ""} /></div>
            <div className="space-y-1"><Label htmlFor="to" className="text-xs">Hasta</Label><Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} /></div>
            <label className="flex items-center gap-2 px-2 h-10">
              <input type="checkbox" name="posted" value="0" defaultChecked={!postedOnly} className="size-4" />
              Incluir borradores
            </label>
            <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      {(Object.entries(groups) as [AccountType, typeof rows][]).map(([t, list]) => (
        <Card key={t}>
          <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium" colSpan={2}>{ACCOUNT_TYPE_LABEL[t]}</th>
                <th className="px-4 py-3 font-medium text-right">Debe</th>
                <th className="px-4 py-3 font-medium text-right">Haber</th>
                <th className="px-4 py-3 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-3 text-center text-muted-foreground text-xs">Sin movimientos.</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.account_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-mono text-xs">{r.account_code}</td>
                  <td className="px-4 py-2">{r.account_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(r.debit)}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(r.credit)}</td>
                  <td className={`px-4 py-2 text-right font-mono ${r.balance < 0 ? "text-destructive" : ""}`}>{formatPrice(r.balance)}</td>
                </tr>
              ))}
              {list.length > 0 && (
                <tr className="font-medium border-t">
                  <td colSpan={2} className="px-4 py-2">Subtotal {ACCOUNT_TYPE_LABEL[t]}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(list.reduce((s, r) => s + r.debit, 0))}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(list.reduce((s, r) => s + r.credit, 0))}</td>
                  <td className="px-4 py-2 text-right font-mono">{formatPrice(list.reduce((s, r) => s + r.balance, 0))}</td>
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
