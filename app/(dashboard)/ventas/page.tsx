import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import {
  listOrders, ORDER_STATUS_BADGE, ORDER_STATUS_LABEL, ORDER_ORIGIN_LABEL,
} from "@/lib/sales";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime, formatPrice } from "@/lib/format";
import type { OrderOrigin, OrderStatus } from "@/lib/supabase-types";

type SP = Promise<{ status?: OrderStatus; origin?: OrderOrigin; success?: string; error?: string }>;

export default async function VentasPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "vendedor", "contador"]);
  const sp = await searchParams;
  const orders = await listOrders({ status: sp.status, origin: sp.origin });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">Órdenes online y POS. Al confirmar, el stock se descuenta solo.</p>
        </div>
        <Button asChild>
          <Link href="/ventas/nueva"><Plus className="size-4" />Nueva venta</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <div className="flex gap-2 text-sm flex-wrap">
        <Chip href="/ventas" active={!sp.status && !sp.origin}>Todas</Chip>
        <Chip href="/ventas?status=borrador" active={sp.status === "borrador"}>Borradores</Chip>
        <Chip href="/ventas?status=confirmada" active={sp.status === "confirmada"}>Confirmadas</Chip>
        <Chip href="/ventas?status=cancelada" active={sp.status === "cancelada"}>Canceladas</Chip>
        <span className="px-2 text-muted-foreground">|</span>
        <Chip href="/ventas?origin=pos" active={sp.origin === "pos"}>POS</Chip>
        <Chip href="/ventas?origin=online" active={sp.origin === "online"}>Online</Chip>
        <Chip href="/ventas?origin=whatsapp" active={sp.origin === "whatsapp"}>WhatsApp</Chip>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Origen</th>
              <th className="px-4 py-3 font-medium">Almacén</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sin ventas.</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link className="font-mono text-primary hover:underline" href={`/ventas/${o.id}`}>{o.code}</Link>
                  {o.reference && <span className="block text-xs text-muted-foreground">Ref. {o.reference}</span>}
                </td>
                <td className="px-4 py-3">{o.customer_name ?? <span className="text-muted-foreground">Consumidor final</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{ORDER_ORIGIN_LABEL[o.origin]}</td>
                <td className="px-4 py-3 text-muted-foreground">{o.warehouse_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${ORDER_STATUS_BADGE[o.status]}`}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                </td>
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

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      className={`px-3 py-1.5 rounded-full border text-xs ${active ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}>
      {children}
    </Link>
  );
}
