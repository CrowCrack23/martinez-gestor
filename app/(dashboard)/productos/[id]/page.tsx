import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission } from "@/lib/auth";
import { getCatalogProduct } from "@/lib/products";
import { listStoresLite } from "@/lib/stores-lite";
import { listCategoriesLite } from "@/lib/categories-lite";
import { getCurrentRate } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { ProductForm } from "@/components/product-form";
import { updateProductAction, deleteProductAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string; success?: string }>;

export default async function ProductoDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("productos");
  const canDelete = hasRole(user, ["admin"]);
  const { id } = await params;
  const [p, sp, stores, categories, rate] = await Promise.all([
    getCatalogProduct(id),
    searchParams,
    listStoresLite(),
    listCategoriesLite(),
    getCurrentRate(),
  ]);
  if (!p) notFound();

  const update = updateProductAction.bind(null, p.id);
  const remove = deleteProductAction.bind(null, p.id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{p.name}</h1>
        <p className="text-sm text-muted-foreground">Editar producto del catálogo.</p>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <ProductForm action={update} stores={stores} categories={categories} initial={p} submitLabel="Guardar cambios" rate={rate && !rate.stale ? rate.rate : null} />
        </CardContent>
      </Card>
      {canDelete && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Eliminar producto</div>
              <div className="text-sm text-muted-foreground">Lo quita del catálogo y de la tienda. No se puede deshacer.</div>
            </div>
            <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>
          </CardContent>
        </Card>
      )}
      <Button asChild variant="ghost"><Link href="/productos">← Volver</Link></Button>
    </div>
  );
}
