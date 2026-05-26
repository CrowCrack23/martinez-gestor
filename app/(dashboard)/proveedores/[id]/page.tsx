import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/auth";
import { getSupplier } from "@/lib/suppliers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteSupplierAction, updateSupplierAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default async function EditarProveedorPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireRole(["admin", "almacenero"]);
  const { id } = await params;
  const [s, sp] = await Promise.all([getSupplier(id), searchParams]);
  if (!s) notFound();
  const canDelete = hasRole(user, ["admin"]);
  const update = updateSupplierAction.bind(null, s.id);
  const remove = deleteSupplierAction.bind(null, s.id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{s.name}</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" required defaultValue={s.name} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contacto</Label>
                <Input id="contact_name" name="contact_name" defaultValue={s.contact_name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax_id">NIT / RUC</Label>
                <Input id="tax_id" name="tax_id" defaultValue={s.tax_id} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" defaultValue={s.phone} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" defaultValue={s.email} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Textarea id="address" name="address" rows={2} defaultValue={s.address} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" rows={2} defaultValue={s.notes} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={s.active} className="size-4" />
              Activo
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/proveedores">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <div className="font-medium">Eliminar proveedor</div>
              <div className="text-sm text-muted-foreground">Falla si tiene órdenes de compra asociadas.</div>
            </div>
            <form action={remove}>
              <Button type="submit" variant="destructive">Eliminar</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
