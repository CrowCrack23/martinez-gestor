import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listCustomers } from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";

type SP = Promise<{ success?: string; error?: string }>;

export default async function ClientesPage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "vendedor", "contador"]);
  const [customers, sp] = await Promise.all([listCustomers(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Personas o empresas que compran. Opcional en cada venta.</p>
        </div>
        <Button asChild>
          <Link href="/clientes/nuevo"><Plus className="size-4" />Nuevo</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin clientes registrados.</td></tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                <td className="px-4 py-3">
                  {c.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/clientes/${c.id}`}><Pencil className="size-3.5" />Editar</Link>
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
