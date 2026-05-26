import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listPurchaseOrders, STATUS_BADGE, STATUS_LABEL } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { PurchaseOrderStatus } from "@/lib/supabase-types";

type SP = Promise<{ status?: PurchaseOrderStatus; success?: string; error?: string }>;

export default async function ComprasPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero", "contador"]);
  const sp = await searchParams;
  const filter = sp.status ? { status: sp.status } : undefined;
  const orders = await listPurchaseOrders(filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <p className="text-sm text-muted-foreground">Órdenes de compra a proveedores. Al recibir, el stock se actualiza solo.</p>
        </div>
        <Button asChild>
          <Link href="/compras/nueva"><Plus className="size-4" />Nueva orden</Link>
        </Button>
      </div>

      <Flash success={sp.success} error={sp.error} />

      <div className="flex gap-2 text-sm">
        <FilterChip href="/compras" active={!sp.status}>Todas</FilterChip>
        <FilterChip href="/compras?status=borrador" active={sp.status === "borrador"}>Borrador</FilterChip>
        <FilterChip href="/compras?status=recibida" active={sp.status === "recibida"}>Recibidas</FilterChip>
        <FilterChip href="/compras?status=cancelada" active={sp.status === "cancelada"}>Canceladas</FilterChip>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Destino</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Líneas</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin órdenes.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link className="font-mono text-primary hover:underline" href={`/compras/${o.id}`}>{o.code}</Link>
                  {o.reference && <span className="block text-xs text-muted-foreground">Fact. {o.reference}</span>}
                </td>
                <td className="px-4 py-3">{o.supplier_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.warehouse_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${STATUS_BADGE[o.status]}`}>
                    {STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{o.line_count}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(o.total_amount)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full border text-xs ${active ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}
    >
      {children}
    </Link>
  );
}
