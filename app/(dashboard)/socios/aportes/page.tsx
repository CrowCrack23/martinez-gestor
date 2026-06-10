import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBusinessesLite } from "@/lib/businesses";
import { listContributions, listPartners } from "@/lib/partners";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import { addContributionAction, deleteContributionAction } from "../actions";

type SP = Promise<{ business?: string; error?: string; success?: string }>;

const fmt = (n: number) =>
  n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function AportesPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("socios");
  const sp = await searchParams;
  const businesses = await listBusinessesLite();
  const business = sp.business || businesses.find((b) => b.slug === "mipyme")?.slug || businesses[0]?.slug || "";
  const [partners, contributions] = business
    ? await Promise.all([listPartners(business), listContributions(business)])
    : [[], []];
  const activePartners = partners.filter((p) => p.active);
  const today = new Date().toISOString().slice(0, 10);

  // Total aportado por socio y moneda.
  const totals = new Map<string, { name: string; cup: number; usd: number }>();
  for (const c of contributions) {
    const t = totals.get(c.partner_id) ?? { name: c.partner_name, cup: 0, usd: 0 };
    if (c.currency === "USD") t.usd += c.amount;
    else t.cup += c.amount;
    totals.set(c.partner_id, t);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Aportes de capital</h1>
          <p className="text-sm text-muted-foreground">
            Capital aportado por los socios. Cada aporte genera su asiento (Caja / Capital social).
          </p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={`/socios?business=${business}`}>← Socios</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <form method="get" className="flex items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="business" className="text-xs">Negocio</Label>
          <Select id="business" name="business" defaultValue={business}>
            {businesses.map((b) => (
              <option key={b.slug} value={b.slug}>{b.label}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline" size="sm">Ver</Button>
      </form>

      {totals.size > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from(totals.entries()).map(([id, t]) => (
            <Card key={id}>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">{t.name}</div>
                <div className="text-xl font-semibold">{fmt(t.cup)} CUP</div>
                {t.usd > 0 && <div className="text-sm text-muted-foreground">{fmt(t.usd)} USD</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="font-medium mb-3">Registrar aporte</div>
          {activePartners.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Este negocio no tiene socios activos. <Link href={`/socios?business=${business}`} className="underline">Crea los socios primero</Link>.
            </p>
          ) : (
            <form action={addContributionAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="business_slug" value={business} />
              <div className="space-y-1">
                <Label htmlFor="partner_id" className="text-xs">Socio</Label>
                <Select id="partner_id" name="partner_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {activePartners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="amount" className="text-xs">Monto</Label>
                <Input id="amount" name="amount" type="number" step="0.01" min="0.01" className="w-36" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="currency" className="text-xs">Moneda</Label>
                <Select id="currency" name="currency" defaultValue="CUP">
                  <option value="CUP">CUP</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="contributed_at" className="text-xs">Fecha</Label>
                <Input id="contributed_at" name="contributed_at" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">Notas</Label>
                <Input id="notes" name="notes" placeholder="Opcional" />
              </div>
              <Button type="submit" size="sm">Registrar</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Socio</th>
                <th className="px-4 py-3 font-medium text-right">Monto</th>
                <th className="px-4 py-3 font-medium">Moneda</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {contributions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    Sin aportes registrados.
                  </td>
                </tr>
              )}
              {contributions.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3">{c.contributed_at}</td>
                  <td className="px-4 py-3">{c.partner_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(c.amount)}</td>
                  <td className="px-4 py-3">{c.currency}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.notes || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteContributionAction.bind(null, c.id, business)} className="inline">
                      <Button type="submit" variant="destructive" size="sm">Eliminar</Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
