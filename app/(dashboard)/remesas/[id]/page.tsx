import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission, remittanceAssignee } from "@/lib/auth";
import { getLatestRate, getRemittance, REM_STATUS_BADGE, REM_STATUS_LABEL, REM_PAYOUT_LABEL, REM_ORIGIN_LABEL, REM_ORIGIN_CURRENCY } from "@/lib/remittances";
import { listUsersByRole } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { RemittanceAmounts } from "@/components/remittance-amounts";
import { formatDateTime } from "@/lib/format";
import {
  cancelRemittanceAction, deleteRemittanceAction, payRemittanceAction, updateRemittanceAction,
} from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

const cupFmt = new Intl.NumberFormat("es-CU", { style: "currency", currency: "CUP", maximumFractionDigits: 2 });
function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CU", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

export default async function RemesaDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("remesas");
  const { id } = await params;
  const [r, couriers, sp, rateUsd, rateEur] = await Promise.all([
    getRemittance(id),
    listUsersByRole("mensajero"),
    searchParams,
    getLatestRate("USD", "CUP"),
    getLatestRate("EUR", "CUP"),
  ]);
  if (!r) notFound();
  const assignee = remittanceAssignee(user);
  const isCourier = assignee !== undefined;
  // El mensajero solo puede abrir las remesas que tiene asignadas.
  if (isCourier && r.assigned_to !== assignee) notFound();
  const pending = r.status === "pendiente";
  const editable = pending && !isCourier;        // el mensajero no edita los datos
  // El dueño puede borrar en cualquier estado (incluye entregadas: se borra
  // también su asiento contable y movimientos de dinero).
  const canDelete = hasRole(user, ["admin"]);
  const cur = REM_ORIGIN_CURRENCY[r.origin];
  const courierName = r.assigned_to ? (couriers.find((c) => c.id === r.assigned_to)?.full_name || couriers.find((c) => c.id === r.assigned_to)?.username || "—") : "—";

  const update = updateRemittanceAction.bind(null, r.id);
  const pay = payRemittanceAction.bind(null, r.id);
  const cancel = cancelRemittanceAction.bind(null, r.id);
  const remove = deleteRemittanceAction.bind(null, r.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-mono">{r.code}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${REM_STATUS_BADGE[r.status]}`}>
            {REM_STATUS_LABEL[r.status]}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-xs">{REM_ORIGIN_LABEL[r.origin]}</span>
          <span className="text-sm text-muted-foreground">
            {money(r.amount_usd, cur)} × {r.exchange_rate} = <strong>{cupFmt.format(r.amount_cup)}</strong>
          </span>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />

      {!editable ? (
        <Card>
          <CardContent className="pt-6 space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Remitente" value={`${r.sender_name}${r.sender_phone ? ` · ${r.sender_phone}` : ""}`} />
              <Field label="Beneficiario" value={`${r.beneficiary_name}${r.beneficiary_phone ? ` · ${r.beneficiary_phone}` : ""}`} />
              <Field label="Cédula" value={r.beneficiary_doc || "—"} />
              <Field label="Origen" value={REM_ORIGIN_LABEL[r.origin]} />
              <Field label="Pago" value={REM_PAYOUT_LABEL[r.payout_method]} />
              {!isCourier && <Field label="Comisión" value={money(r.commission_usd, cur)} />}
              <Field label="Mensajero" value={courierName} />
              {!isCourier && r.courier_fee_cup > 0 && <Field label="Pago al mensajero" value={cupFmt.format(r.courier_fee_cup)} />}
              <Field label="Creada" value={formatDateTime(r.created_at)} />
              {r.paid_at && <Field label="Entregada" value={formatDateTime(r.paid_at)} />}
              {r.status === "entregada" && r.delivery_amount != null && (
                <Field label="Entregado" value={money(r.delivery_amount, r.delivery_currency)} />
              )}
              {!isCourier && r.status === "entregada" && r.profit_cup != null && (
                <Field
                  label="Ganancia (comisión + tasa)"
                  value={`${cupFmt.format(r.profit_cup)} (comisión ${cupFmt.format(r.commission_usd * r.exchange_rate)})`}
                />
              )}
            </div>
            {r.beneficiary_address && <Field label="Dirección" value={r.beneficiary_address} />}
            {r.notes && <Field label="Notas" value={r.notes} />}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form action={update} className="space-y-5">
              <div>
                <div className="text-sm font-medium mb-2">Remitente</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="sender_name">Nombre *</Label><Input id="sender_name" name="sender_name" required defaultValue={r.sender_name} /></div>
                  <div className="space-y-2"><Label htmlFor="sender_phone">Teléfono</Label><Input id="sender_phone" name="sender_phone" defaultValue={r.sender_phone} /></div>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Beneficiario</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="beneficiary_name">Nombre *</Label><Input id="beneficiary_name" name="beneficiary_name" required defaultValue={r.beneficiary_name} /></div>
                  <div className="space-y-2"><Label htmlFor="beneficiary_phone">Teléfono</Label><Input id="beneficiary_phone" name="beneficiary_phone" defaultValue={r.beneficiary_phone} /></div>
                  <div className="space-y-2"><Label htmlFor="beneficiary_doc">Cédula / CI</Label><Input id="beneficiary_doc" name="beneficiary_doc" defaultValue={r.beneficiary_doc} /></div>
                  <div className="space-y-2"><Label htmlFor="payout_method">Pago</Label>
                    <Select id="payout_method" name="payout_method" defaultValue={r.payout_method}>
                      {Object.entries(REM_PAYOUT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="space-y-2 mt-3"><Label htmlFor="beneficiary_address">Dirección</Label><Textarea id="beneficiary_address" name="beneficiary_address" rows={2} defaultValue={r.beneficiary_address} /></div>
              </div>
              <RemittanceAmounts
                rates={{ eeuu: null, europa: null }}
                initial={{ origin: r.origin, amount: r.amount_usd, rate: r.exchange_rate, commission: r.commission_usd }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="assigned_to">Mensajero</Label>
                  <Select id="assigned_to" name="assigned_to" defaultValue={r.assigned_to ?? ""}>
                    <option value="">— Sin asignar —</option>
                    {couriers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.username}</option>)}
                  </Select>
                  <p className="text-xs text-muted-foreground">Quién lleva el dinero al beneficiario.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="courier_fee_cup">Pago al mensajero (CUP)</Label>
                  <Input id="courier_fee_cup" name="courier_fee_cup" type="number" step="0.01" min="0" defaultValue={r.courier_fee_cup || ""} placeholder="0" />
                  <p className="text-xs text-muted-foreground">Por esta entrega; se liquida en el cuadre semanal.</p>
                </div>
              </div>
              <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} defaultValue={r.notes} /></div>
              <div className="flex gap-2 justify-end pt-2">
                <Button asChild variant="ghost"><Link href="/remesas">Cancelar</Link></Button>
                <Button type="submit" variant="outline">Guardar cambios</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {pending && (
        <>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <div className="font-medium">Marcar entregada</div>
                <div className="text-sm text-muted-foreground">Cuando el beneficiario reciba el dinero.</div>
              </div>
              {isCourier ? (
                <form action={pay}><Button type="submit">Marcar entregada</Button></form>
              ) : (
                <form action={pay} className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="delivery_currency" className="text-xs">Moneda entregada</Label>
                    <Select id="delivery_currency" name="delivery_currency" defaultValue="CUP">
                      <option value="CUP">CUP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="delivery_amount" className="text-xs">Monto entregado</Label>
                    <Input id="delivery_amount" name="delivery_amount" type="number" step="0.01" min="0.01" defaultValue={r.amount_cup} className="w-36" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="delivery_cost_rate" className="text-xs">Tasa de costo →CUP</Label>
                    <Input
                      id="delivery_cost_rate"
                      name="delivery_cost_rate"
                      type="number"
                      step="0.0001"
                      min="0"
                      defaultValue={r.origin === "europa" ? (rateEur?.rate ?? "") : (rateUsd?.rate ?? "")}
                      className="w-32"
                    />
                  </div>
                  <Button type="submit">Marcar entregada</Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Si entrega CUP, la tasa de costo no se usa. Si entrega USD/EUR, la tasa de costo
                    (cuánto cuesta conseguir esa moneda, en CUP) determina la ganancia por diferencia de tasas.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="pt-6 flex items-center justify-between">
              <div><div className="font-medium">{isCourier ? "No entregada" : "Cancelar"}</div><div className="text-sm text-muted-foreground">{isCourier ? "Si no pudiste entregar el dinero al beneficiario." : "Deja la remesa en historial sin entregarla."}</div></div>
              <div className="flex gap-2">
                <form action={cancel}><Button type="submit" variant="outline">{isCourier ? "No entregada" : "Cancelar"}</Button></form>
                {canDelete && <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Borrado disponible en cualquier estado, solo admin. */}
      {!pending && canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Eliminar remesa</div>
              <div className="text-sm text-muted-foreground">
                {r.status === "entregada"
                  ? "Borra la remesa, su asiento contable y sus movimientos de dinero. No se puede deshacer."
                  : "Borra la remesa por completo. No se puede deshacer."}
              </div>
            </div>
            <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
          </CardContent>
        </Card>
      )}
      <div><Button asChild variant="ghost"><Link href="/remesas">← Volver</Link></Button></div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground text-xs">{label}</div><div>{value}</div></div>;
}
