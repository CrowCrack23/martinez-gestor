import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listStock } from "@/lib/inventory";
import { listWarehouses } from "@/lib/warehouses";
import { listStoresLite } from "@/lib/stores-lite";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeftRight, Plus } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { Flash } from "@/components/flash";

type SP = Promise<{ warehouse?: string; store?: string; low?: string; success?: string; error?: string }>;

export default async function InventarioPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero", "vendedor"]);
  const sp = await searchParams;
  const filter = {
    warehouseId: sp.warehouse || undefined,
    store: sp.store || undefined,
    lowOnly: sp.low === "1",
  };
  const [rows, warehouses, stores] = await Promise.all([
    listStock(filter),
    listWarehouses(),
    listStoresLite(),
  ]);

  const lowCount = rows.filter((r) => r.quantity <= r.min_stock).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventario</h1>
          <p className="text-sm text-muted-foreground">Stock por producto y almacén.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/inventario/movimientos"><ArrowLeftRight className="size-4" />Ver movimientos</Link>
          </Button>
          <Button asChild>
            <Link href="/inventario/movimientos/nuevo"><Plus className="size-4" />Nuevo movimiento</Link>
          </Button>
        </div>
      </div>

      <Flash success={sp.success} error={sp.error} />

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3 text-sm" action="/inventario">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Almacén</label>
            <select name="warehouse" defaultValue={filter.warehouseId ?? ""} className="h-9 rounded-md border border-input bg-background px-2">
              <option value="">Todos</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tienda</label>
            <select name="store" defaultValue={filter.store ?? ""} className="h-9 rounded-md border border-input bg-background px-2">
              <option value="">Todas</option>
              {stores.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 px-2 h-9">
            <input type="checkbox" name="low" value="1" defaultChecked={filter.lowOnly} className="size-4" />
            Solo bajo stock
          </label>
          <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/inventario">Limpiar</Link></Button>
        </form>
      </Card>

      {lowCount > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" />
          {lowCount} {lowCount === 1 ? "producto está" : "productos están"} en o por debajo del stock mínimo.
        </div>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Almacén</th>
              <th className="px-4 py-3 font-medium text-right">Cantidad</th>
              <th className="px-4 py-3 font-medium text-right">Mín</th>
              <th className="px-4 py-3 font-medium text-right">Máx</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin resultados.</td></tr>
            )}
            {rows.map((r) => {
              const low = r.quantity <= r.min_stock;
              return (
                <tr key={`${r.product_id}-${r.warehouse_id}`} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.product_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.product_store}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.warehouse_name}</td>
                  <td className={`px-4 py-3 text-right font-mono ${low ? "text-destructive font-semibold" : ""}`}>
                    {formatNumber(r.quantity)}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground font-mono">{formatNumber(r.min_stock)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground font-mono">{r.max_stock != null ? formatNumber(r.max_stock) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
