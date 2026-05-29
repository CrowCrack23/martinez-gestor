"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { RemittanceOrigin } from "@/lib/supabase-types";

const CURRENCY: Record<RemittanceOrigin, string> = { eeuu: "USD", europa: "EUR" };
const ORIGIN_LABEL: Record<RemittanceOrigin, string> = { eeuu: "🇺🇸 Estados Unidos", europa: "🇪🇺 Europa" };

// Sección de origen + montos para crear/editar una remesa. El monto y la comisión
// están en la moneda del origen (USD para EEUU, EUR para Europa). Al cambiar el
// origen, prefija la tasa con la última registrada de esa moneda.
export function RemittanceAmounts({
  rates,
  initial,
}: {
  rates: { eeuu: number | null; europa: number | null };
  initial?: { origin: RemittanceOrigin; amount: number; rate: number; commission: number };
}) {
  const [origin, setOrigin] = useState<RemittanceOrigin>(initial?.origin ?? "eeuu");
  const [rate, setRate] = useState<string>(
    initial ? String(initial.rate) : rates.eeuu != null ? String(rates.eeuu) : "",
  );
  const cur = CURRENCY[origin];

  function onOriginChange(next: RemittanceOrigin) {
    setOrigin(next);
    // Si el usuario no había tocado una tasa propia (o estamos creando), prefija
    // con la última tasa registrada de la nueva moneda.
    const latest = rates[next];
    if (!initial && latest != null) setRate(String(latest));
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Origen y montos</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="origin">Origen *</Label>
          <Select id="origin" name="origin" value={origin} onChange={(e) => onOriginChange(e.target.value as RemittanceOrigin)}>
            {(Object.keys(ORIGIN_LABEL) as RemittanceOrigin[]).map((o) => (
              <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">Moneda de envío: <strong>{cur}</strong></p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="amount_usd">Monto enviado ({cur}) *</Label>
          <Input id="amount_usd" name="amount_usd" type="number" step="0.01" min={0.01} required defaultValue={initial ? String(initial.amount) : undefined} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="exchange_rate">Tasa {cur}→CUP *</Label>
          <Input id="exchange_rate" name="exchange_rate" type="number" step="0.0001" min={0.0001} required value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="commission_usd">Comisión ({cur})</Label>
          <Input id="commission_usd" name="commission_usd" type="number" step="0.01" min={0} defaultValue={initial ? String(initial.commission) : "0"} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">El CUP a entregar se calcula automáticamente (monto × tasa).</p>
    </div>
  );
}
