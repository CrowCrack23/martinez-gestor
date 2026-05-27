import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listStoresLite } from "@/lib/stores-lite";
import { listCategoriesLite } from "@/lib/categories-lite";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { ProductForm } from "@/components/product-form";
import { createProductAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoProductoPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero"]);
  const [sp, stores, categories] = await Promise.all([
    searchParams,
    listStoresLite(),
    listCategoriesLite(),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Nuevo producto</h1>
        <p className="text-sm text-muted-foreground">Se agrega al catálogo compartido con la tienda online.</p>
      </div>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <ProductForm action={createProductAction} stores={stores} categories={categories} submitLabel="Crear producto" />
        </CardContent>
      </Card>
      <Button asChild variant="ghost"><Link href="/productos">← Volver</Link></Button>
    </div>
  );
}
