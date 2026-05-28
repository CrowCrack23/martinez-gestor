import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listProductionOrders, PRODUCTION_STATUS_BADGE, PRODUCTION_STATUS_LABEL } from "@/lib/production";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime } from "@/lib/format";

type SP = Promise<{ success?: string; error?: string }>;

export default async function ProduccionPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("produccion");
  const [orders, sp] = await Promise.all([listProductionOrders(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Producción</h1>
          <p className="text-sm text-muted-foreground">Órdenes de producción. Al producir, consume insumos y suma producto terminado al stock.</p>
        </div>
        <Button asChild><Link href="/produccion/nueva"><Plus className="size-4" />Nueva orden</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Receta</th>
              <th className="px-4 py-3 font-medium">Almacén</th>
              <th className="px-4 py-3 font-medium text-right">Cantidad</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin órdenes.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3"><Link className="font-mono text-primary hover:underline" href={`/produccion/${o.id}`}>{o.code}</Link></td>
                <td className="px-4 py-3">{o.bom_name} <span className="text-xs text-muted-foreground">→ {o.finished_product_name}</span></td>
                <td className="px-4 py-3 text-muted-foreground">{o.warehouse_name}</td>
                <td className="px-4 py-3 text-right font-mono">{o.quantity}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${PRODUCTION_STATUS_BADGE[o.status]}`}>
                    {PRODUCTION_STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
