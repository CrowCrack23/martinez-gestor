import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listAccounts } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { JournalLineEditor } from "@/components/journal-line-editor";
import { createJournalEntryAction } from "../../actions";

type SP = Promise<{ error?: string }>;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function NuevoAsientoPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "contador"]);
  const [accounts, sp] = await Promise.all([listAccounts(), searchParams]);
  const active = accounts.filter((a) => a.active);
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo asiento</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createJournalEntryAction} className="space-y-5">
            <div className="grid grid-cols-[160px_1fr] gap-3">
              <div className="space-y-2"><Label htmlFor="entry_date">Fecha *</Label><Input id="entry_date" name="entry_date" type="date" required defaultValue={todayISO()} /></div>
              <div className="space-y-2"><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" rows={1} placeholder="Concepto general del asiento" /></div>
            </div>
            <JournalLineEditor accounts={active.map((a) => ({ id: a.id, code: a.code, name: a.name }))} />
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/contabilidad/asientos">Cancelar</Link></Button>
              <Button type="submit">Crear (borrador)</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
