import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listSuppliers } from "@/lib/suppliers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";

type SP = Promise<{ success?: string; error?: string }>;

export default async function ProveedoresPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "almacenero", "contador"]);
  const [suppliers, sp] = await Promise.all([listSuppliers(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">Empresas o personas que te venden mercancía.</p>
        </div>
        <Button asChild>
          <Link href="/proveedores/nuevo"><Plus className="size-4" />Nuevo</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin proveedores aún.</td></tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.contact_name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.phone || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{s.email || "—"}</td>
                <td className="px-4 py-3">
                  {s.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/proveedores/${s.id}`}><Pencil className="size-3.5" />Editar</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
