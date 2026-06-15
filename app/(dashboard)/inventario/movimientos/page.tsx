import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listMovements, MOVEMENT_TYPE_LABEL } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime, formatQty } from "@/lib/format";

type SP = Promise<{ success?: string; error?: string }>;

const TYPE_BADGE: Record<string, string> = {
  entrada: "bg-success/10 text-success",
  salida: "bg-destructive/10 text-destructive",
  transferencia: "bg-primary/10 text-primary",
  ajuste: "bg-warning/10 text-warning-foreground",
  merma: "bg-muted text-muted-foreground",
};

export default async function MovimientosPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("movimientos");
  const [movements, sp] = await Promise.all([listMovements(200), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Movimientos de inventario</h1>
          <p className="text-sm text-muted-foreground">Historial de entradas, salidas, transferencias, ajustes y mermas.</p>
        </div>
        <Button asChild>
          <Link href="/inventario/movimientos/nuevo"><Plus className="size-4" />Nuevo movimiento</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Origen → Destino</th>
              <th className="px-4 py-3 font-medium text-right">Líneas</th>
              <th className="px-4 py-3 font-medium text-right">Unidades</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Notas</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Aún no hay movimientos.</td></tr>
            )}
            {movements.map((m) => (
              <tr key={m.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${TYPE_BADGE[m.type] ?? "bg-muted"}`}>
                    {MOVEMENT_TYPE_LABEL[m.type]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {m.warehouse_from_name ?? "—"} → {m.warehouse_to_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">{m.line_count}</td>
                <td className="px-4 py-3 text-right font-mono">{formatQty(m.total_quantity)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{m.user_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{m.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
