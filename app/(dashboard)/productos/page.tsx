import Link from "next/link";
import { Plus, Check } from "lucide-react";
import { requirePermission, businessScope } from "@/lib/auth";
import { listCatalog } from "@/lib/products";
import { listStoresLite } from "@/lib/stores-lite";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatPrice } from "@/lib/format";

type SP = Promise<{ store?: string; success?: string; error?: string }>;

export default async function ProductosPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePermission("productos");
  const scope = businessScope(user);
  const sp = await searchParams;
  const [rows, stores] = await Promise.all([
    listCatalog({ store: sp.store || undefined, scope }),
    listStoresLite(),
  ]);
  const storeLabel = (slug: string | null) =>
    slug == null ? "— (solo almacén)" : (stores.find((s) => s.slug === slug)?.label ?? slug);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Productos</h1>
          <p className="text-sm text-muted-foreground">Catálogo compartido con la tienda online. El stock se gestiona en Inventario.</p>
        </div>
        <Button asChild>
          <Link href="/productos/nuevo"><Plus className="size-4" />Nuevo producto</Link>
        </Button>
      </div>

      <Flash success={sp.success} error={sp.error} />

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3 text-sm" action="/productos">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Tienda</label>
            <select name="store" defaultValue={sp.store ?? ""} className="h-9 rounded-md border border-input bg-background px-2">
              <option value="">Todas</option>
              {stores.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm"><Link href="/productos">Limpiar</Link></Button>
        </form>
      </Card>

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-right">Precio USD</th>
              <th className="px-4 py-3 font-medium text-right">Precio CUP</th>
              <th className="px-4 py-3 font-medium text-center">Online</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin productos.</td></tr>
            )}
            {rows.map((p) => (
              <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link className="font-medium text-primary hover:underline" href={`/productos/${p.id}`}>{p.name}</Link>
                  <div className="flex gap-1 mt-0.5">
                    {p.featured && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Destacado</span>}
                    {p.is_new && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Nuevo</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{storeLabel(p.store)}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.category ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPrice(p.price)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {p.price_cup != null ? formatPrice(p.price_cup) : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {p.online_visible
                    ? <Check className="size-4 text-success inline" />
                    : <span className="text-xs text-muted-foreground">No</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}
