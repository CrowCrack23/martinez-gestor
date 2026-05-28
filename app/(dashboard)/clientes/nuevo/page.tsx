import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { createCustomerAction } from "../actions";

type SP = Promise<{ error?: string }>;

export default async function NuevoClientePage({ searchParams }: { searchParams: SP }) {
  await requireRole(["admin", "vendedor"]);
  const sp = await searchParams;
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <Flash error={sp.error} />
      <Card>
        <CardContent className="pt-6">
          <form action={createCustomerAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="phone">Teléfono</Label><Input id="phone" name="phone" /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="address">Dirección</Label><Textarea id="address" name="address" rows={2} /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notas</Label><Textarea id="notes" name="notes" rows={2} /></div>
            <div className="flex gap-2 justify-end pt-2">
              <Button asChild variant="ghost"><Link href="/clientes">Cancelar</Link></Button>
              <Button type="submit">Crear</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
