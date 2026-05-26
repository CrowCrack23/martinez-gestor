import { Trash2 } from "lucide-react";
import { requireRole, hasRole } from "@/lib/auth";
import { listAccounts, ACCOUNT_TYPE_LABEL } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createAccountAction, deleteAccountAction, updateAccountAction } from "../actions";

type SP = Promise<{ success?: string; error?: string }>;

export default async function CuentasPage({ searchParams }: { searchParams: SP }) {
  const user = await requireRole(["admin", "contador"]);
  const [accounts, sp] = await Promise.all([listAccounts(), searchParams]);
  const canDelete = hasRole(user, ["admin"]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Plan de cuentas</h1>
        <p className="text-sm text-muted-foreground">Catálogo contable. Edita inline o agrega cuentas con el formulario.</p>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createAccountAction} className="grid grid-cols-[100px_1fr_160px_180px_auto] gap-2 items-end">
            <div className="space-y-1"><Label htmlFor="code" className="text-xs">Código</Label><Input id="code" name="code" required placeholder="5500" /></div>
            <div className="space-y-1"><Label htmlFor="name" className="text-xs">Nombre</Label><Input id="name" name="name" required placeholder="Nombre cuenta" /></div>
            <div className="space-y-1"><Label htmlFor="type" className="text-xs">Tipo</Label>
              <Select id="type" name="type" required defaultValue="">
                <option value="">— Tipo —</option>
                {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <div className="space-y-1"><Label htmlFor="parent_id" className="text-xs">Cuenta padre</Label>
              <Select id="parent_id" name="parent_id" defaultValue="">
                <option value="">— Ninguna —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </Select>
            </div>
            <Button type="submit">Agregar</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-3 py-3 font-medium">Código</th>
              <th className="px-3 py-3 font-medium">Nombre</th>
              <th className="px-3 py-3 font-medium">Tipo</th>
              <th className="px-3 py-3 font-medium">Estado</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin cuentas.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-b-0">
                <td colSpan={5} className="p-0">
                  <form action={updateAccountAction.bind(null, a.id)} className="grid grid-cols-[100px_1fr_140px_120px_auto_auto] gap-2 items-center px-3 py-2">
                    <Input name="code" required defaultValue={a.code} className="h-9 font-mono" />
                    <Input name="name" required defaultValue={a.name} className="h-9" />
                    <Select name="type" defaultValue={a.type} className="h-9">
                      {Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input type="checkbox" name="active" defaultChecked={a.active} className="size-4" />Activa
                    </label>
                    <input type="hidden" name="parent_id" value={a.parent_id ?? ""} />
                    <div className="flex gap-1">
                      <Button type="submit" size="sm" variant="outline">Guardar</Button>
                    </div>
                  </form>
                  {canDelete && (
                    <form action={deleteAccountAction.bind(null, a.id)} className="px-3 pb-2 -mt-1 text-right">
                      <button type="submit" className="text-xs text-destructive hover:underline inline-flex items-center gap-1">
                        <Trash2 className="size-3" /> eliminar
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
