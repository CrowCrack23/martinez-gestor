import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getLatestRate, REM_PAYOUT_LABEL } from "@/lib/remittances";
import { listUsersByRole } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { RemittanceAmounts } from "@/components/remittance-amounts";
import { createRemittanceAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaRemesaPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("remesas");
  const [usdRate, eurRate, couriers, sp] = await Promise.all([
    getLatestRate("USD", "CUP"),
    getLatestRate("EUR", "CUP"),
    listUsersByRole("mensajero"),
    searchParams,
  ]);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nueva remesa</h1>
      <Flash error={sp.error} />
      {(!usdRate || !eurRate) && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
          Faltan tasas: {!usdRate ? "USD→CUP " : ""}{!eurRate ? "EUR→CUP" : ""}.{" "}
          <Link href="/remesas/tasas" className="underline">Registrar tasas</Link>.
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
            <RemittanceAmounts rates={{ eeuu: usdRate?.rate ?? null, europa: eurRate?.rate ?? null }} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="assigned_to">Mensajero</Label>
                <Select id="assigned_to" name="assigned_to" defaultValue="">
                  <option value="">— Sin asignar —</option>
                  {couriers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.username}</option>)}
                </Select>
                <p className="text-xs text-muted-foreground">Quién lleva el dinero al beneficiario. Verá esta remesa en su lista.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="courier_fee_cup">Pago al mensajero (CUP)</Label>
                <Input id="courier_fee_cup" name="courier_fee_cup" type="number" step="0.01" min="0" placeholder="0" />
                <p className="text-xs text-muted-foreground">Por esta entrega; se liquida en el cuadre semanal.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="operation_date">Fecha de la remesa *</Label>
                <Input id="operation_date" name="operation_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            </div>
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
