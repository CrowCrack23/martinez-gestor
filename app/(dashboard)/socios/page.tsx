import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listBusinessesLite } from "@/lib/businesses";
import { getGrowthPct, listPartners, percentagesStatus } from "@/lib/partners";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Flash } from "@/components/flash";
import {
  createPartnerAction,
  deletePartnerAction,
  setGrowthPctAction,
  togglePartnerAction,
  updatePartnerAction,
} from "./actions";

type SP = Promise<{ business?: string; error?: string; success?: string }>;

export default async function SociosPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("socios");
  const sp = await searchParams;
  const businesses = await listBusinessesLite();
  const business = sp.business || businesses.find((b) => b.slug === "mipyme")?.slug || businesses[0]?.slug || "";
  const [partners, growthPct, status] = business
    ? await Promise.all([listPartners(business), getGrowthPct(business), percentagesStatus(business)])
    : [[], 0, { partnersPct: 0, growthPct: 0, total: 0, ok: false }];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Socios</h1>
          <p className="text-sm text-muted-foreground">
            Socios por negocio con % fijo de la ganancia mensual. La suma de los % de socios + el % de
            crecimiento de la empresa debe dar 100.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/socios/aportes?business=${business}`}>Aportes de capital</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={`/socios/reparto?business=${business}`}>Reparto mensual</Link></Button>
        </div>
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

      <div className={`rounded-md border px-4 py-3 text-sm ${status.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
        Socios {status.partnersPct.toFixed(2)} % + Crecimiento {status.growthPct.toFixed(2)} % ={" "}
        <span className="font-semibold">{status.total.toFixed(2)} %</span>
        {status.ok ? " — listo para repartir" : " — debe sumar 100 % para poder repartir"}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-3 font-medium">Socio</th>
                <th className="px-4 py-3 font-medium text-right">% de la ganancia</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {partners.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">
                    Este negocio no tiene socios registrados.
                  </td>
                </tr>
              )}
              {partners.map((p) => {
                const update = updatePartnerAction.bind(null, p.id, business);
                const toggle = togglePartnerAction.bind(null, p.id, business, !p.active);
                const remove = deletePartnerAction.bind(null, p.id, business);
                return (
                  <tr key={p.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.notes && <div className="text-xs text-muted-foreground">{p.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={update} className="inline-flex items-center gap-2 justify-end">
                        <Input
                          name="profit_pct"
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={p.profit_pct}
                          className="w-24 text-right"
                        />
                        <Button type="submit" variant="outline" size="sm">Guardar</Button>
                      </form>
                    </td>
                    <td className="px-4 py-3">
                      {p.active ? (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-success/10 text-success">Activo</span>
                      ) : (
                        <span className="text-xs rounded-full px-2 py-0.5 bg-muted text-muted-foreground">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2 justify-end">
                        <form action={toggle} className="inline">
                          <Button type="submit" variant="outline" size="sm">
                            {p.active ? "Desactivar" : "Activar"}
                          </Button>
                        </form>
                        <form action={remove} className="inline">
                          <Button type="submit" variant="destructive" size="sm">Eliminar</Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="font-medium mb-3">Nuevo socio</div>
            <form action={createPartnerAction} className="space-y-3">
              <input type="hidden" name="business_slug" value={business} />
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Nombre</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="profit_pct" className="text-xs">% de la ganancia</Label>
                <Input id="profit_pct" name="profit_pct" type="number" step="0.01" min="0" max="100" defaultValue="0" required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs">Notas</Label>
                <Input id="notes" name="notes" placeholder="Opcional" />
              </div>
              <Button type="submit" size="sm">Crear socio</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="font-medium mb-3">% de crecimiento de la empresa</div>
            <p className="text-xs text-muted-foreground mb-3">
              Parte de la ganancia mensual que se queda en la empresa para reinvertir. Modificable cuando haga falta.
            </p>
            <form action={setGrowthPctAction} className="flex items-end gap-3">
              <input type="hidden" name="business_slug" value={business} />
              <div className="space-y-1">
                <Label htmlFor="growth_pct" className="text-xs">% crecimiento</Label>
                <Input
                  id="growth_pct"
                  name="growth_pct"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={growthPct}
                  className="w-32"
                  required
                />
              </div>
              <Button type="submit" size="sm">Guardar</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
