import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listLots } from "@/lib/costing";
import { listWarehouses } from "@/lib/warehouses";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatPrice, formatDateTime, formatQty } from "@/lib/format";
import { Flash } from "@/components/flash";
import { setOpeningLotCostAction } from "./actions";

type SP = Promise<{ warehouse?: string; all?: string; success?: string; error?: string }>;

const SOURCE_LABEL: Record<string, string> = {
  compra: "Compra",
  produccion: "Producción",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
  inicial: "Apertura",
  manual: "Manual",
};

export default async function LotesPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("lotes");
  const sp = await searchParams;
  const onlyRemaining = sp.all !== "1";
  const [lots, warehouses] = await Promise.all([
    listLots({ warehouseId: sp.warehouse || undefined, onlyRemaining }),
    listWarehouses(),
  ]);

  const totalValue = lots.reduce((s, l) => s + l.qty_remaining * l.unit_cost, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Lotes y costos</h1>
          <p className="text-sm text-muted-foreground">
            Cada entrada de stock es un lote con su costo. Las salidas consumen lotes por orden de antigüedad (FIFO).
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/inventario"><ArrowLeft className="size-4" />Inventario</Link>
        </Button>
      </div>

      <Flash success={sp.success} error={sp.error} />

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3 text-sm" action="/inventario/lotes">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Almacén</label>
            <select name="warehouse" defaultValue={sp.warehouse ?? ""} className="h-9 rounded-md border border-input bg-background px-2">
              <option value="">Todos</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 px-2 h-9">
            <input type="checkbox" name="all" value="1" defaultChecked={!onlyRemaining} className="size-4" />
            Incluir lotes agotados
          </label>
          <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/inventario/lotes">Limpiar</Link></Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Almacén</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium text-right">Recibido</th>
              <th className="px-4 py-3 font-medium text-right">Saldo</th>
              <th className="px-4 py-3 font-medium text-right">Costo unit.</th>
              <th className="px-4 py-3 font-medium text-right">Valor saldo</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin lotes.</td></tr>
            )}
            {lots.map((l) => {
              const editable = l.source_type === "inicial" && l.qty_remaining === l.qty_received;
              return (
                <tr key={l.id} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDateTime(l.received_at)}</td>
                  <td className="px-4 py-3 font-medium">{l.product_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{l.warehouse_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABEL[l.source_type] ?? l.source_type}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{formatQty(l.qty_received)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatQty(l.qty_remaining)}</td>
                  <td className="px-4 py-3 text-right">
                    {editable ? (
                      <form action={setOpeningLotCostAction} className="flex items-center justify-end gap-1">
                        <input type="hidden" name="lot_id" value={l.id} />
                        <input
                          type="number" name="unit_cost" step="any" min="0" defaultValue={l.unit_cost}
                          className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right font-mono"
                        />
                        <Button type="submit" size="sm" variant="secondary">Guardar</Button>
                      </form>
                    ) : (
                      <span className="font-mono">{formatPrice(l.unit_cost)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(l.qty_remaining * l.unit_cost)}</td>
                </tr>
              );
            })}
          </tbody>
          {lots.length > 0 && (
            <tfoot className="border-t">
              <tr>
                <td colSpan={7} className="px-4 py-3 text-right text-sm text-muted-foreground">Valor total de saldos</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{formatPrice(totalValue)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Los lotes de <strong>apertura</strong> (stock que ya existía) entraron a costo 0. Ajústalos aquí mientras no
        hayan tenido salidas, para que el costo de ventas y la valuación del inventario sean correctos.
      </p>
    </div>
  );
}
