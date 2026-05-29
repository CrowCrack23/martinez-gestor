import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { listRoles } from "@/lib/users";
import { listStoresLite } from "@/lib/stores-lite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createUserAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoUsuarioPage({ searchParams }: { searchParams: SP }) {
  await requirePermission("usuarios");
  const [roles, stores, sp] = await Promise.all([listRoles(), listStoresLite(), searchParams]);
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo usuario</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createUserAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input id="full_name" name="full_name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
              <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 p-2 border rounded-md text-sm hover:bg-muted/30 cursor-pointer">
                    <input type="checkbox" name="roles" value={r.id} className="mt-0.5 size-4" />
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Negocios</Label>
              <p className="text-xs text-muted-foreground">Tiendas cuyos datos (ventas, inventario, compras, contabilidad) podrá ver. El rol Administrador ve todos.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stores.map((s) => (
                  <label key={s.slug} className="flex items-center gap-2 p-2 border rounded-md text-sm hover:bg-muted/30 cursor-pointer">
                    <input type="checkbox" name="businesses" value={s.slug} className="size-4" />
                    <span className="font-medium">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/usuarios">Cancelar</Link></Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
