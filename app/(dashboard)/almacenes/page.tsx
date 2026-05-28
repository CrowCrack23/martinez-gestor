import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { listWarehouses, WAREHOUSE_TYPE_LABEL } from "@/lib/warehouses";
import { requirePermission } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";

type SP = Promise<{ success?: string; error?: string }>;

export default async function AlmacenesPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("almacenes");
  const [warehouses, sp] = await Promise.all([listWarehouses(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Almacenes</h1>
          <p className="text-sm text-muted-foreground">Tiendas físicas, online, centros de elaboración y almacenes centrales.</p>
        </div>
        <Button asChild>
          <Link href="/almacenes/nuevo"><Plus className="size-4" />Nuevo</Link>
        </Button>
      </div>

      <Flash success={sp.success} error={sp.error} />

      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Tienda</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No hay almacenes registrados.</td></tr>
            )}
            {warehouses.map((w) => (
              <tr key={w.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{w.code}</td>
                <td className="px-4 py-3 font-medium">{w.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{WAREHOUSE_TYPE_LABEL[w.type]}</td>
                <td className="px-4 py-3 text-muted-foreground">{w.store_slug ?? "—"}</td>
                <td className="px-4 py-3">
                  {w.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/almacenes/${w.id}`}><Pencil className="size-3.5" />Editar</Link>
                  </Button>
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
