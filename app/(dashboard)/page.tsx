import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight, Boxes, Plus, Warehouse } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { landingPathForRoles } from "@/lib/permissions";
import { listWarehouses } from "@/lib/warehouses";
import { listStock, listMovements, MOVEMENT_TYPE_LABEL } from "@/lib/inventory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber, formatQty } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  // El dashboard (KPIs de inventario de toda la empresa) es solo para admin. Al
  // resto se le manda a su primera sección permitida.
  if (!user.roles.includes("admin")) redirect(landingPathForRoles(user.roles));
  const [warehouses, stock, movements] = await Promise.all([
    listWarehouses(),
    listStock(),
    listMovements(8),
  ]);

  const totalUnits = stock.reduce((s, r) => s + r.quantity, 0);
  const lowStock = stock.filter((r) => r.quantity <= r.min_stock);
  const activeWarehouses = warehouses.filter((w) => w.active).length;

  // Top almacenes por unidades
  const byWarehouse = new Map<string, { name: string; qty: number }>();
  for (const r of stock) {
    const cur = byWarehouse.get(r.warehouse_id) ?? { name: r.warehouse_name, qty: 0 };
    cur.qty += r.quantity;
    byWarehouse.set(r.warehouse_id, cur);
  }
  const topWarehouses = Array.from(byWarehouse.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hola, {user.fullName || user.username}</h1>
        <p className="text-sm text-muted-foreground">Resumen general del inventario.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Unidades en stock" value={formatQty(totalUnits)} icon={<Boxes className="size-4" />} />
        <KpiCard label="Almacenes activos" value={String(activeWarehouses)} icon={<Warehouse className="size-4" />} />
        <KpiCard
          label="Bajo stock"
          value={String(lowStock.length)}
          icon={<Boxes className="size-4" />}
          tone={lowStock.length > 0 ? "warning" : "neutral"}
        />
        <KpiCard label="Movimientos recientes" value={String(movements.length)} icon={<ArrowLeftRight className="size-4" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Stock por almacén</CardTitle>
            <CardDescription>Top 5 por unidades totales</CardDescription>
          </CardHeader>
          <CardContent>
            {topWarehouses.length === 0 ? (
              <EmptyHint
                text="Crea almacenes y registra movimientos para ver datos aquí."
                action={{ href: "/almacenes/nuevo", label: "Crear almacén" }}
              />
            ) : (
              <ul className="space-y-2 text-sm">
                {topWarehouses.map((w) => (
                  <li key={w.name} className="flex items-center justify-between">
                    <span>{w.name}</span>
                    <span className="font-mono text-muted-foreground">{formatQty(w.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Productos en alerta</CardTitle>
                <CardDescription>En o bajo el stock mínimo</CardDescription>
              </div>
              {lowStock.length > 0 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/inventario?low=1">Ver todos</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todo el stock está por encima del mínimo. 🎉</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lowStock.slice(0, 6).map((r) => (
                  <li key={`${r.product_id}-${r.warehouse_id}`} className="flex items-center justify-between gap-3">
                    <span className="truncate">{r.product_name} <span className="text-muted-foreground">— {r.warehouse_name}</span></span>
                    <span className="font-mono text-destructive whitespace-nowrap">
                      {formatQty(r.quantity)} / {formatNumber(r.min_stock)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Últimos movimientos</CardTitle>
              <CardDescription>Las 8 operaciones más recientes</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/inventario/movimientos/nuevo"><Plus className="size-3.5" />Nuevo</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <EmptyHint
              text="Aún no se ha registrado ningún movimiento."
              action={{ href: "/inventario/movimientos/nuevo", label: "Registrar movimiento" }}
            />
          ) : (
            <ul className="divide-y text-sm">
              {movements.map((m) => (
                <li key={m.id} className="py-2 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium">{MOVEMENT_TYPE_LABEL[m.type]} <span className="text-muted-foreground font-normal">· {m.line_count} líneas · {formatQty(m.total_quantity)} u.</span></div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.warehouse_from_name ?? "—"} → {m.warehouse_to_name ?? "—"} {m.notes && `· ${m.notes}`}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, icon, tone = "neutral" }: { label: string; value: string; icon: React.ReactNode; tone?: "neutral" | "warning" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground uppercase tracking-wide">
          <span>{label}</span>
          <span className={tone === "warning" ? "text-warning" : ""}>{icon}</span>
        </div>
        <div className={`text-3xl font-semibold mt-2 ${tone === "warning" ? "text-warning" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text, action }: { text: string; action: { href: string; label: string } }) {
  return (
    <div className="text-sm text-muted-foreground flex items-center justify-between gap-3">
      <span>{text}</span>
      <Button asChild size="sm" variant="outline"><Link href={action.href}>{action.label}</Link></Button>
    </div>
  );
}
