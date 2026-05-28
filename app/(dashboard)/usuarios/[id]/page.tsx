import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { listRoles, listUsers } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { deleteUserAction, updateUserAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default async function EditarUsuarioPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const current = await requirePermission("usuarios");
  const [{ id }, users, roles, sp] = await Promise.all([params, listUsers(), listRoles(), searchParams]);
  const user = users.find((u) => u.id === id);
  if (!user) notFound();
  const isSelf = current.id === user.id;

  const update = updateUserAction.bind(null, user.id);
  const remove = deleteUserAction.bind(null, user.id);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{user.full_name || user.email}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={update} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input id="full_name" name="full_name" defaultValue={user.full_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña (opcional)</Label>
              <Input id="password" name="password" type="password" minLength={8} placeholder="Dejar en blanco para no cambiar" />
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 p-2 border rounded-md text-sm hover:bg-muted/30 cursor-pointer">
                    <input type="checkbox" name="roles" value={r.id} defaultChecked={user.roles.includes(r.id)} className="mt-0.5 size-4" />
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={user.active} disabled={isSelf} className="size-4" />
              Activo {isSelf && <span className="text-xs text-muted-foreground">(no puedes desactivarte a ti mismo)</span>}
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/usuarios">Cancelar</Link></Button>
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {!isSelf && (
        <Card className="border-destructive/30">
          <CardContent className="pt-6 flex items-center justify-between">
            <div>
              <div className="font-medium">Eliminar usuario</div>
              <div className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</div>
            </div>
            <form action={remove}>
              <Button type="submit" variant="destructive">Eliminar</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
