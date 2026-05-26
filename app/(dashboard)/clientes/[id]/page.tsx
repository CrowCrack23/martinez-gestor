import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/auth";
import { getCustomer } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteCustomerAction, updateCustomerAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default async function EditarClientePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireRole(["admin", "vendedor"]);
  const { id } = await params;
  const [c, sp] = await Promise.all([getCustomer(id), searchParams]);
  if (!c) notFound();
  const canDelete = hasRole(user, ["admin"]);
  const update = updateCustomerAction.bind(null, c.id);
  const remove = deleteCustomerAction.bind(null, c.id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{c.name}</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Nombre *</Label><Input id="name" name="name" required defaultValue={c.name} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" defaultValue={c.phone} /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={c.email} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Textarea id="address" name="address" rows={2} defaultValue={c.address} /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} defaultValue={c.notes} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={c.active} className="size-4" />Activo
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/clientes">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div><div className="font-medium">Eliminar cliente</div><div className="text-sm text-muted-foreground">Falla si tiene órdenes asociadas.</div></div>
            <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
