import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listProductsLite } from "@/lib/products-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { BomComponentsEditor } from "@/components/bom-components-editor";
import { createBomAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevaRecetaPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("recetas");
  const [products, sp] = await Promise.all([listProductsLite(), searchParams]);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nueva receta</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createBomAction} className="space-y-5">
            <div className="space-y-2"><Label htmlFor="name">Nombre *</Label><Input id="name" name="name" required placeholder="Pizza de queso 30cm" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="product_id">Producto terminado *</Label>
                <Select id="product_id" name="product_id" required defaultValue="">
                  <option value="">— Selecciona —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>[{p.store}] {p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="yield">Rendimiento</Label>
                <Input id="yield" name="yield" type="number" step="0.01" min={0.01} defaultValue="1" />
                <p className="text-xs text-muted-foreground">Unidades producidas por una "vuelta" de la receta.</p>
              </div>
            </div>
            <BomComponentsEditor products={products} />
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/recetas">Cancelar</Link></Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
