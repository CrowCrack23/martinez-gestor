import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { landingPathForRoles } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = Promise<{ next?: string; error?: string }>;

async function loginAction(formData: FormData) {
  "use server";
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  let dest = next || "/";
  try {
    const u = await signIn(username, password);
    // Sin destino explícito (o "/"), aterrizar en la sección que le corresponde:
    // admin → dashboard; el resto → su primera sección permitida.
    if (dest === "/") dest = landingPathForRoles(u.roles);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    redirect(`/login?error=${encodeURIComponent(msg)}&next=${encodeURIComponent(next)}`);
  }
  redirect(dest);
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = sp.next ?? "/";
  const error = sp.error;
  return (
    <main className="min-h-dvh grid place-items-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Martínez Gestor</CardTitle>
          <CardDescription>Inicia sesión para continuar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="username">Usuario</Label>
              <Input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            )}
            <Button type="submit" className="w-full">Entrar</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
