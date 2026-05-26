import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listJournalEntries, JOURNAL_STATUS_BADGE, JOURNAL_STATUS_LABEL } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";
import type { JournalEntryStatus } from "@/lib/supabase-types";

type SP = Promise<{ status?: JournalEntryStatus; success?: string; error?: string }>;

export default async function AsientosPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "contador"]);
  const sp = await searchParams;
  const entries = await listJournalEntries({ status: sp.status });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Asientos de diario</h1>
          <p className="text-sm text-muted-foreground">Movimientos contables. Cada asiento debe estar balanceado (debe = haber).</p>
        </div>
        <Button asChild><Link href="/contabilidad/asientos/nuevo"><Plus className="size-4" />Nuevo asiento</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <div className="flex gap-2 text-sm">
        <Chip href="/contabilidad/asientos" active={!sp.status}>Todos</Chip>
        <Chip href="/contabilidad/asientos?status=borrador" active={sp.status === "borrador"}>Borradores</Chip>
        <Chip href="/contabilidad/asientos?status=contabilizada" active={sp.status === "contabilizada"}>Contabilizados</Chip>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Debe</th>
              <th className="px-4 py-3 font-medium text-right">Haber</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin asientos.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3"><Link className="font-mono text-primary hover:underline" href={`/contabilidad/asientos/${e.id}`}>{e.code}</Link></td>
                <td className="px-4 py-3 font-mono">{e.entry_date}</td>
                <td className="px-4 py-3 max-w-md truncate">{e.description}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${JOURNAL_STATUS_BADGE[e.status]}`}>
                    {JOURNAL_STATUS_LABEL[e.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(e.total_debit)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(e.total_credit)}</td>
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
