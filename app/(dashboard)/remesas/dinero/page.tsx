import Link from "next/link";
import { hasRole, requirePermission } from "@/lib/auth";
import { capitalSnapshot } from "@/lib/capital";
import {
  HOLDER_KIND_LABEL,
  HOLDER_LOCATION_LABEL,
  holderBalances,
  listHolders,
  type HolderLocation,
} from "@/lib/money-holders";
import { REM_BUSINESS_LABEL } from "@/lib/remittances";
import { listUsersByRole } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { addMovementAction, createHolderAction, toggleHolderAction } from "./actions";

type SP = Promise<{ business?: string; error?: string; success?: string }>;

const BUSINESSES = ["remesas_eeuu", "remesas_europa"] as const;
type RemBusiness = (typeof BUSINESSES)[number];

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function balanceText(balances: Partial<Record<string, number>>): string {
  const parts = Object.entries(balances)
    .filter(([, v]) => v && Math.abs(v) >= 0.01)
    .map(([c, v]) => `${fmt(v!)} ${c}`);
  return parts.length ? parts.join(" · ") : "0.00";
}

export default async function DineroRemesasPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("remesas");
  const sp = await searchParams;
  const business: RemBusiness = BUSINESSES.includes(sp.business as RemBusiness)
    ? (sp.business as RemBusiness)
    : "remesas_eeuu";
  const isAdmin = hasRole(user, ["admin"]);
  const [overview, holders, snapshot, couriers] = await Promise.all([
    holderBalances(business),
    listHolders(business),
    capitalSnapshot(business),
    listUsersByRole("mensajero"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const activeHolders = holders.filter((h) => h.active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Dinero del negocio</h1>
          <p className="text-sm text-muted-foreground">
            Quién tiene el dinero en cada momento: mensajeros con efectivo pendiente, deudores y cajas — allá y acá.
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/remesas">← Remesas</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <form method="get" className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="business" className="text-xs">Negocio</Label>
          <Select id="business" name="business" defaultValue={business}>
            {BUSINESSES.map((b) => (
              <option key={b} value={b}>{REM_BUSINESS_LABEL[b]}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm">Ver</Button>
      </form>

      {/* Allá vs acá + caja contable */}
      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(overview.byLocation) as HolderLocation[]).map((loc) => (
          <Card key={loc}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">En manos de personas — {HOLDER_LOCATION_LABEL[loc]}</div>
              <div className="text-xl font-semibold">{balanceText(overview.byLocation[loc])}</div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Caja contable del negocio</div>
            <div className="text-xl font-semibold">{fmt(snapshot.cash.total)} CUP</div>
            <div className="text-xs text-muted-foreground">
              Caja CUP {fmt(snapshot.cash.cup)} · Caja USD {fmt(snapshot.cash.usd)} · Banco {fmt(snapshot.cash.bank)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Holders con saldo */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Tenedor</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 font-medium text-right">Saldo (tiene del negocio)</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {overview.holders.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    Sin tenedores registrados. Cree mensajeros, deudores o cajas abajo.
                  </td>
                </tr>
              )}
              {overview.holders.map(({ holder: h, balances }) => {
                const toggle = toggleHolderAction.bind(null, h.id, business, !h.active);
                return (
                  <tr key={h.id} className={`border-b last:border-b-0 ${h.active ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{h.name}</div>
                      {h.notes && <div className="text-xs text-muted-foreground">{h.notes}</div>}
                    </td>
                    <td className="px-4 py-3">{HOLDER_KIND_LABEL[h.kind]}</td>
                    <td className="px-4 py-3">{HOLDER_LOCATION_LABEL[h.location]}</td>
                    <td className="px-4 py-3 text-right font-mono">{balanceText(balances)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <form action={toggle} className="inline">
                          <Button type="submit" variant="outline" size="sm">{h.active ? "Desactivar" : "Activar"}</Button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="font-medium mb-3">Nuevo tenedor</div>
              <form action={createHolderAction} className="space-y-3">
                <input type="hidden" name="business_slug" value={business} />
                <div className="space-y-1">
                  <Label htmlFor="name" className="text-xs">Nombre</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="kind" className="text-xs">Tipo</Label>
                    <Select id="kind" name="kind" defaultValue="mensajero">
                      {Object.entries(HOLDER_KIND_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="location" className="text-xs">Ubicación</Label>
                    <Select id="location" name="location" defaultValue="aca">
                      {Object.entries(HOLDER_LOCATION_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="app_user_id" className="text-xs">Usuario vinculado (si es mensajero)</Label>
                  <Select id="app_user_id" name="app_user_id" defaultValue="">
                    <option value="">— Ninguno —</option>
                    {couriers.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name || c.username}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Si se vincula, el efectivo de sus entregas se descuenta automáticamente de su saldo.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="notes" className="text-xs">Notas</Label>
                  <Input id="notes" name="notes" placeholder="Opcional" />
                </div>
                <Button type="submit" size="sm">Crear</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="font-medium mb-3">Registrar movimiento</div>
              {activeHolders.length === 0 ? (
                <p className="text-xs text-muted-foreground">Cree un tenedor primero.</p>
              ) : (
                <form action={addMovementAction} className="space-y-3">
                  <input type="hidden" name="business_slug" value={business} />
                  <div className="space-y-1">
                    <Label htmlFor="holder_id" className="text-xs">Tenedor</Label>
                    <Select id="holder_id" name="holder_id" required defaultValue="">
                      <option value="">— Selecciona —</option>
                      {activeHolders.map((h) => (
                        <option key={h.id} value={h.id}>{h.name} ({HOLDER_KIND_LABEL[h.kind]})</option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="direction" className="text-xs">Dirección</Label>
                      <Select id="direction" name="direction" defaultValue="in">
                        <option value="in">Recibe dinero (+ saldo)</option>
                        <option value="out">Devuelve / paga (− saldo)</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="kind_mov" className="text-xs">Tipo</Label>
                      <Select id="kind_mov" name="kind" defaultValue="ajuste">
                        <option value="deuda">Deuda (le presté / me debe)</option>
                        <option value="cobro">Cobro de deuda</option>
                        <option value="liquidacion">Liquidación de mensajero</option>
                        <option value="ajuste">Ajuste</option>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="amount" className="text-xs">Monto</Label>
                      <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="currency" className="text-xs">Moneda</Label>
                      <Select id="currency" name="currency" defaultValue="CUP">
                        <option value="CUP">CUP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="occurred_at" className="text-xs">Fecha</Label>
                      <Input id="occurred_at" name="occurred_at" type="date" defaultValue={today} required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="notes_mov" className="text-xs">Notas</Label>
                    <Input id="notes_mov" name="notes" placeholder="Opcional" />
                  </div>
                  <Button type="submit" size="sm">Registrar</Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
