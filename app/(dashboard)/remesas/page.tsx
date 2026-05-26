import Link from "next/link";
import { Plus, Banknote } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listRemittances, REM_STATUS_BADGE, REM_STATUS_LABEL, REM_PAYOUT_LABEL } from "@/lib/remittances";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime } from "@/lib/format";
import type { RemittanceStatus } from "@/lib/supabase-types";

type SP = Promise<{ status?: RemittanceStatus; success?: string; error?: string }>;

const cupFmt = new Intl.NumberFormat("es-CU", { style: "currency", currency: "CUP", maximumFractionDigits: 2 });
const usdFmt = new Intl.NumberFormat("es-CU", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default async function RemesasPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "vendedor", "contador"]);
  const sp = await searchParams;
  const list = await listRemittances({ status: sp.status });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Remesas</h1>
          <p className="text-sm text-muted-foreground">Operaciones de envío USD → entrega CUP al beneficiario.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/remesas/tasas"><Banknote className="size-4" />Tasas</Link></Button>
          <Button asChild><Link href="/remesas/nueva"><Plus className="size-4" />Nueva remesa</Link></Button>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <div className="flex gap-2 text-sm">
        <Chip href="/remesas" active={!sp.status}>Todas</Chip>
        <Chip href="/remesas?status=pendiente" active={sp.status === "pendiente"}>Pendientes</Chip>
        <Chip href="/remesas?status=entregada" active={sp.status === "entregada"}>Entregadas</Chip>
        <Chip href="/remesas?status=cancelada" active={sp.status === "cancelada"}>Canceladas</Chip>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Beneficiario</th>
              <th className="px-4 py-3 font-medium text-right">USD</th>
              <th className="px-4 py-3 font-medium text-right">Tasa</th>
              <th className="px-4 py-3 font-medium text-right">CUP a entregar</th>
              <th className="px-4 py-3 font-medium">Pago</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin remesas.</td></tr>
            )}
            {list.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3"><Link className="font-mono text-primary hover:underline" href={`/remesas/${r.id}`}>{r.code}</Link></td>
                <td className="px-4 py-3"><div className="font-medium">{r.beneficiary_name}</div><div className="text-xs text-muted-foreground">{r.beneficiary_phone}</div></td>
                <td className="px-4 py-3 text-right font-mono">{usdFmt.format(r.amount_usd)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{r.exchange_rate}</td>
                <td className="px-4 py-3 text-right font-mono">{cupFmt.format(r.amount_cup)}</td>
                <td className="px-4 py-3 text-muted-foreground">{REM_PAYOUT_LABEL[r.payout_method]}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${REM_STATUS_BADGE[r.status]}`}>
                    {REM_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(r.created_at)}</td>
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
    <Link href={href} className={`px-3 py-1.5 rounded-full border text-xs ${active ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"}`}>
      {children}
    </Link>
  );
}
