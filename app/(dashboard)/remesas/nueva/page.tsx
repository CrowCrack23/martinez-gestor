import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getLatestRate, REM_PAYOUT_LABEL } from "@/lib/remittances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createRemittanceAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaRemesaPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("remesas");
  const [rate, sp] = await Promise.all([getLatestRate("USD", "CUP"), searchParams]);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nueva remesa</h1>
      <Flash error={sp.error} />
      {!rate && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
          No hay tasa USD→CUP registrada. <Link href="/remesas/tasas" className="underline">Registrar una</Link>.
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <form action={createRemittanceAction} className="space-y-5">
            <div>
              <div className="text-sm font-medium mb-2">Remitente (envía)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="sender_name">Nombre *</Label><Input id="sender_name" name="sender_name" required /></div>
                <div className="space-y-2"><Label htmlFor="sender_phone">Teléfono</Label><Input id="sender_phone" name="sender_phone" /></div>
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Beneficiario (recibe)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="beneficiary_name">Nombre *</Label><Input id="beneficiary_name" name="beneficiary_name" required /></div>
                <div className="space-y-2"><Label htmlFor="beneficiary_phone">Teléfono</Label><Input id="beneficiary_phone" name="beneficiary_phone" /></div>
                <div className="space-y-2"><Label htmlFor="beneficiary_doc">Cédula / CI</Label><Input id="beneficiary_doc" name="beneficiary_doc" /></div>
                <div className="space-y-2"><Label htmlFor="payout_method">Pago</Label>
                  <Select id="payout_method" name="payout_method" defaultValue="efectivo">
                    {Object.entries(REM_PAYOUT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
              </div>
              <div className="space-y-2 mt-3"><Label htmlFor="beneficiary_address">Dirección</Label><Textarea id="beneficiary_address" name="beneficiary_address" rows={2} /></div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">Montos</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2"><Label htmlFor="amount_usd">USD enviados *</Label><Input id="amount_usd" name="amount_usd" type="number" step="0.01" min={0.01} required /></div>
                <div className="space-y-2"><Label htmlFor="exchange_rate">Tasa USD→CUP *</Label><Input id="exchange_rate" name="exchange_rate" type="number" step="0.0001" min={0.0001} required defaultValue={rate ? String(rate.rate) : ""} /></div>
                <div className="space-y-2"><Label htmlFor="commission_usd">Comisión (USD)</Label><Input id="commission_usd" name="commission_usd" type="number" step="0.01" min={0} defaultValue="0" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">El CUP a entregar se calcula automáticamente (USD × tasa).</p>
            </div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/remesas">Cancelar</Link></Button>
              <Button type="submit">Crear (pendiente)</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
