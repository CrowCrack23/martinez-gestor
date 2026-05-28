import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listPayrollRuns, PAYROLL_STATUS_LABEL } from "@/lib/hr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";

type SP = Promise<{ success?: string; error?: string }>;

export default async function NominaPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("nomina");
  const [runs, sp] = await Promise.all([listPayrollRuns(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Nómina</h1>
          <p className="text-sm text-muted-foreground">Períodos de pago. Al crear un período se calculan automáticamente las líneas según asistencia.</p>
        </div>
        <Button asChild><Link href="/nomina/nuevo"><Plus className="size-4" />Nuevo período</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Notas</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin períodos.</td></tr>
            )}
            {runs.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/nomina/${r.id}`} className="text-primary hover:underline">
                    {r.period_start} → {r.period_end}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${r.status === "cerrada" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {PAYROLL_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">{r.notes}</td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm"><Link href={`/nomina/${r.id}`}>Abrir</Link></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
