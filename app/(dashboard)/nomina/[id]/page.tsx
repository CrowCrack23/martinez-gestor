import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { getPayrollRun, PAYROLL_STATUS_LABEL } from "@/lib/hr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";
import { closePayrollRunAction, deletePayrollRunAction, updatePayrollItemAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ success?: string; error?: string }>;

export default async function NominaDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requirePermission("nomina");
  const { id } = await params;
  const [data, sp] = await Promise.all([getPayrollRun(id), searchParams]);
  if (!data) notFound();
  const { run, items } = data;
  const editable = run.status === "borrador";
  const totalGross = items.reduce((s, i) => s + Number(i.gross), 0);
  const totalCommission = items.reduce((s, i) => s + Number(i.commission), 0);
  const totalDeductions = items.reduce((s, i) => s + Number(i.deductions), 0);
  const totalNet = items.reduce((s, i) => s + Number(i.net), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-mono">{run.period_start} → {run.period_end}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${run.status === "cerrada" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
              {PAYROLL_STATUS_LABEL[run.status]}
            </span>
            {run.notes && <span className="text-sm text-muted-foreground">{run.notes}</span>}
          </div>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-3 font-medium">Empleado</th>
              <th className="px-2 py-3 font-medium text-right">Base</th>
              <th className="px-2 py-3 font-medium text-right">Comisión</th>
              <th className="px-2 py-3 font-medium text-right">Días / {items[0]?.days_in_period ?? "—"}</th>
              <th className="px-2 py-3 font-medium text-right">Bruto</th>
              <th className="px-2 py-3 font-medium text-right">Deducc.</th>
              <th className="px-2 py-3 font-medium text-right">Neto</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Sin empleados activos al momento de creación.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-b-0">
                <td colSpan={8} className="p-0">
                  <form
                    action={editable ? updatePayrollItemAction.bind(null, run.id, it.id) : undefined}
                    className="grid grid-cols-[1.3fr_90px_110px_80px_110px_110px_110px_60px] gap-2 items-center px-3 py-2"
                  >
                    <div>
                      <div className="font-medium text-sm">{it.employee_name}</div>
                      <div className="text-xs text-muted-foreground">{it.notes}</div>
                    </div>
                    <div className="text-right font-mono text-xs text-muted-foreground">{formatPrice(it.base_salary)}</div>
                    <div className="text-right font-mono text-xs text-muted-foreground" title={it.sales_base > 0 ? `Sobre ventas ${formatPrice(it.sales_base)}` : undefined}>
                      {it.commission > 0 ? formatPrice(it.commission) : "—"}
                    </div>
                    <Input name="days_worked" type="number" step="0.5" min={0} defaultValue={String(it.days_worked)} className="h-9 text-right" disabled={!editable} />
                    <Input name="gross" type="number" step="0.01" min={0} defaultValue={String(it.gross)} className="h-9 text-right" disabled={!editable} />
                    <Input name="deductions" type="number" step="0.01" min={0} defaultValue={String(it.deductions)} className="h-9 text-right" disabled={!editable} />
                    <div className="text-right font-mono text-sm font-medium">{formatPrice(it.net)}</div>
                    <div className="text-right">{editable && <Button type="submit" size="sm" variant="outline">↻</Button>}</div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium border-t">
              <td className="px-3 py-3">Totales ({items.length})</td>
              <td></td>
              <td className="px-2 py-3 text-right font-mono">{formatPrice(totalCommission)}</td>
              <td></td>
              <td className="px-2 py-3 text-right font-mono">{formatPrice(totalGross)}</td>
              <td className="px-2 py-3 text-right font-mono">{formatPrice(totalDeductions)}</td>
              <td className="px-2 py-3 text-right font-mono">{formatPrice(totalNet)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        </div>
      </Card>

      {editable && (
        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
            <div>
              <div className="font-medium">Cerrar período</div>
              <div className="text-sm text-muted-foreground">Una vez cerrada no se pueden editar las líneas.</div>
            </div>
            <form action={closePayrollRunAction.bind(null, run.id)}>
              <Button type="submit">Cerrar nómina</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {editable && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div><div className="font-medium">Eliminar período</div><div className="text-sm text-muted-foreground">Borra el borrador y todas sus líneas.</div></div>
            <form action={deletePayrollRunAction.bind(null, run.id)}>
              <Button type="submit" variant="destructive">Eliminar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div>
        <Button asChild variant="ghost"><Link href="/nomina">← Volver</Link></Button>
      </div>
    </div>
  );
}
