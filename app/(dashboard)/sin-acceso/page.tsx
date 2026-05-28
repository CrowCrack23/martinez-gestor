import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SinAccesoPage() {
  const user = await requireUser();
  return (
    <div className="max-w-md mx-auto mt-10">
      <Card>
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 grid place-items-center">
            <ShieldAlert className="size-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Sin acceso</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tu cuenta ({user.roles.join(", ") || "sin rol"}) no tiene permiso para esta sección.
              Si crees que es un error, contacta a un administrador.
            </p>
          </div>
          <Button asChild>
            <Link href="/">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
