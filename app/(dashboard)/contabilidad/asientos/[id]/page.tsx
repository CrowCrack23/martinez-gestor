import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getJournalEntry, listAccounts, JOURNAL_STATUS_BADGE, JOURNAL_STATUS_LABEL } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { JournalLineEditor } from "@/components/journal-line-editor";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  deleteJournalEntryAction, postJournalEntryAction, updateJournalEntryAction,
} from "../../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ success?: string; error?: string }>;

export default async function AsientoDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireRole(["admin", "contador"]);
  const { id } = await params;
  const [entry, sp] = await Promise.all([getJournalEntry(id), searchParams]);
  if (!entry) notFound();
  const editable = entry.status === "borrador";
  const balanced = Math.abs(entry.total_debit - entry.total_credit) < 0.005;

  if (!editable) {
    return (
      <div className="max-w-3xl space-y-6">
        <Header entry={entry} />
        <Flash success={sp.success} error={sp.error} />
        <Card>
          <CardContent className="pt-6 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha" value={entry.entry_date} />
              <Field label="Contabilizada" value={entry.posted_at ? formatDateTime(entry.posted_at) : "—"} />
            </div>
            {entry.description && <Field label="Descripción" value={entry.description} />}
          </CardContent>
        </Card>
        <Card>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Cuenta</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 font-medium text-right">Debe</th>
                <th className="px-3 py-2 font-medium text-right">Haber</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">{l.account_code} <span className="text-muted-foreground">{l.account_name}</span></td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{l.description}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.debit > 0 ? formatPrice(l.debit) : "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.credit > 0 ? formatPrice(l.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium border-t">
                <td colSpan={2} className="px-3 py-2 text-right">Totales</td>
                <td className="px-3 py-2 text-right font-mono">{formatPrice(entry.total_debit)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatPrice(entry.total_credit)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
        <div><Button asChild variant="ghost"><Link href="/contabilidad/asientos">← Volver</Link></Button></div>
      </div>
    );
  }

  const accounts = (await listAccounts()).filter((a) => a.active);
  const update = updateJournalEntryAction.bind(null, entry.id);
  const post = postJournalEntryAction.bind(null, entry.id);
  const remove = deleteJournalEntryAction.bind(null, entry.id);

  return (
    <div className="max-w-3xl space-y-6">
      <Header entry={entry} />
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-5">
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <div className="space-y-2"><Label htmlFor="entry_date">Fecha *</Label><Input id="entry_date" name="entry_date" type="date" required defaultValue={entry.entry_date} /></div>
              <div className="space-y-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" rows={1} defaultValue={entry.description} /></div>
            </div>
            <JournalLineEditor
              accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }))}
              initial={entry.lines.map((l) => ({ account_id: l.account_id, debit: l.debit, credit: l.credit, description: l.description }))}
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/contabilidad/asientos">Cancelar</Link></Button>
              <Button type="submit" variant="outline">Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="font-medium">Contabilizar</div>
            <div className="text-sm text-muted-foreground">{balanced ? "El asiento está balanceado y listo." : "El asiento no está balanceado todavía."}</div>
          </div>
          <form action={post}><Button type="submit" disabled={!balanced}>Contabilizar</Button></form>
        </CardContent>
      </Card>
      <Card className="border-destructive/30">
        <CardContent className="pt-6 flex items-center justify-between">
          <div><div className="font-medium">Eliminar borrador</div><div className="text-sm text-muted-foreground">Solo disponible si el asiento aún no se ha contabilizado.</div></div>
          <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ entry }: { entry: { code: string; status: "borrador" | "contabilizada"; total_debit: number; total_credit: number } }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold font-mono">{entry.code}</h1>
      <div className="mt-1 flex items-center gap-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${JOURNAL_STATUS_BADGE[entry.status]}`}>
          {JOURNAL_STATUS_LABEL[entry.status]}
        </span>
        <span className="text-sm text-muted-foreground">
          Debe <span className="font-mono">{formatPrice(entry.total_debit)}</span> ·
          Haber <span className="font-mono">{formatPrice(entry.total_credit)}</span>
        </span>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-muted-foreground text-xs">{label}</div><div>{value}</div></div>;
}
