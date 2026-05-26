import { Trash2 } from "lucide-react";
import { requireRole, hasRole } from "@/lib/auth";
import { listExchangeRates } from "@/lib/remittances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteExchangeRateAction, upsertExchangeRateAction } from "../actions";

type SP = Promise<{ success?: string; error?: string }>;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function TasasPage({ searchParams }: { searchParams: SP }) {
  const user = await requireRole(["admin", "contador"]);
  const [rates, sp] = await Promise.all([listExchangeRates(60), searchParams]);
  const canDelete = hasRole(user, ["admin"]);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tasas de cambio</h1>
        <p className="text-sm text-muted-foreground">Registro diario de la tasa USD→CUP usada en remesas.</p>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={upsertExchangeRateAction} className="grid grid-cols-[140px_1fr_120px_auto] gap-2 items-end">
            <div className="space-y-1"><Label htmlFor="day" className="text-xs">Fecha</Label><Input id="day" name="day" type="date" required defaultValue={todayISO()} /></div>
            <div className="space-y-1">
              <Label htmlFor="rate" className="text-xs">Tasa</Label>
              <div className="grid grid-cols-[1fr_60px_1fr] gap-1 items-center">
                <Input id="rate" name="rate" type="number" step="0.0001" min={0.0001} required placeholder="380.00" />
                <div className="text-center text-xs text-muted-foreground">USD→</div>
                <Input name="currency_to" defaultValue="CUP" />
              </div>
              <input type="hidden" name="currency_from" value="USD" />
            </div>
            <div className="space-y-1"><Label htmlFor="notes" className="text-xs">Notas</Label><Input id="notes" name="notes" placeholder="Opcional" /></div>
            <Button type="submit">Guardar</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Par</th>
              <th className="px-4 py-3 font-medium text-right">Tasa</th>
              <th className="px-4 py-3 font-medium">Notas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin tasas registradas.</td></tr>}
            {rates.map((r) => (
              <tr key={`${r.day}-${r.currency_from}-${r.currency_to}`} className="border-b last:border-b-0">
                <td className="px-4 py-3 font-mono">{r.day}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.currency_from} → {r.currency_to}</td>
                <td className="px-4 py-3 text-right font-mono">{r.rate}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.notes || "—"}</td>
                <td className="px-4 py-3 text-right">
                  {canDelete && (
                    <form action={deleteExchangeRateAction.bind(null, r.day, r.currency_from, r.currency_to)}>
                      <button type="submit" className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
                        <Trash2 className="size-3" /> eliminar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
