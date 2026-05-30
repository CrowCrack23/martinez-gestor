import Link from "next/link";
import { requirePermission, businessScope } from "@/lib/auth";
import { listAccounts } from "@/lib/accounting";
import { listBusinessesLite } from "@/lib/businesses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
  const user = await requirePermission("contabilidad");
  const [accounts, businesses, sp] = await Promise.all([listAccounts(), listBusinessesLite(), searchParams]);
  const active = accounts.filter((a) => a.active);
  // Si el usuario está limitado a negocios, solo puede asentar en los suyos.
  const businessOptions = businessScope(user) ? businesses.filter((b) => user.businesses.includes(b.slug)) : businesses;
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
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="business">Negocio</Label>
              <Select id="business" name="business" defaultValue={businessOptions.length === 1 ? businessOptions[0].slug : ""}>
                <option value="">— General / consolidado —</option>
                {businessOptions.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
              </Select>
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
