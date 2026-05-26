import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/auth";
import { getBom } from "@/lib/production";
import { listProductsLite } from "@/lib/products-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { BomComponentsEditor } from "@/components/bom-components-editor";
import { deleteBomAction, updateBomAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

export default async function EditarRecetaPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireRole(["admin", "almacenero"]);
  const { id } = await params;
  const [bom, products, sp] = await Promise.all([getBom(id), listProductsLite(), searchParams]);
  if (!bom) notFound();
  const canDelete = hasRole(user, ["admin"]);
  const update = updateBomAction.bind(null, bom.id);
  const remove = deleteBomAction.bind(null, bom.id);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{bom.name}</h1>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="name">Nombre *</Label><Input id="name" name="name" required defaultValue={bom.name} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="product_id">Producto terminado *</Label>
                <Select id="product_id" name="product_id" required defaultValue={bom.product_id}>
                  {products.map((p) => <option key={p.id} value={p.id}>[{p.store}] {p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="yield">Rendimiento</Label>
                <Input id="yield" name="yield" type="number" step="0.01" min={0.01} defaultValue={String(bom.yield)} />
              </div>
            </div>
            <BomComponentsEditor
              products={products}
              initial={bom.components.map((c) => ({ component_product_id: c.component_product_id, quantity_per_unit: c.quantity_per_unit }))}
            />
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} defaultValue={bom.notes} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={bom.active} className="size-4" />Activa
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/recetas">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div><div className="font-medium">Eliminar receta</div><div className="text-sm text-muted-foreground">Falla si tiene órdenes de producción asociadas.</div></div>
            <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
