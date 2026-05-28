import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { listUsers } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime } from "@/lib/format";

type SP = Promise<{ success?: string; error?: string }>;

export default async function UsuariosPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("usuarios");
  const [users, sp] = await Promise.all([listUsers(), searchParams]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Personas que acceden al sistema y sus roles.</p>
        </div>
        <Button asChild>
          <Link href="/usuarios/nuevo"><Plus className="size-4" />Nuevo</Link>
        </Button>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Creado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                Sin usuarios. Crea el primero con el script: <code>node scripts/hash-password.mjs --create email password &quot;Nombre&quot; admin</code>
              </td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{u.full_name || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.length === 0 && <span className="text-muted-foreground text-xs">sin rol</span>}
                    {u.roles.map((r) => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-muted text-xs">{r}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-success/10 text-success text-xs">Activo</span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">Inactivo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/usuarios/${u.id}`}><Pencil className="size-3.5" />Editar</Link>
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
