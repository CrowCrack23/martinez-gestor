import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listBoms } from "@/lib/production";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";

type SP = Promise<{ success?: string; error?: string }>;

export default async function RecetasPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero"]);
  const [boms, sp] = await Promise.all([listBoms(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recetas (BOM)</h1>
          <p className="text-sm text-muted-foreground">Define qué insumos consumen tus productos terminados.</p>
        </div>
        <Button asChild><Link href="/recetas/nueva"><Plus className="size-4" />Nueva receta</Link></Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Producto terminado</th>
              <th className="px-4 py-3 font-medium text-right">Rendimiento</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {boms.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin recetas.</td></tr>
            )}
            {boms.map((b) => (
              <tr key={b.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{b.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{b.product_name}</td>
                <td className="px-4 py-3 text-right font-mono">{b.yield}</td>
                <td className="px-4 py-3">
                  {b.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activa</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactiva</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm"><Link href={`/recetas/${b.id}`}><Pencil className="size-3.5" />Editar</Link></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
