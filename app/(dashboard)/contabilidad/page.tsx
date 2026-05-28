import Link from "next/link";
import { BookOpen, FileText, Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ContabilidadIndex() {
  await requirePermission("contabilidad");
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Contabilidad</h1>
        <p className="text-sm text-muted-foreground">Plan de cuentas, asientos manuales y balance.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile href="/contabilidad/cuentas" icon={<BookOpen className="size-5" />} title="Plan de cuentas" desc="Catálogo de cuentas (activo, pasivo, ingreso, gasto, etc.)" />
        <Tile href="/contabilidad/asientos" icon={<FileText className="size-5" />} title="Asientos de diario" desc="Registrar movimientos contables manuales." />
        <Tile href="/contabilidad/balance" icon={<Scale className="size-5" />} title="Balance" desc="Saldo de comprobación por cuenta." />
      </div>
    </div>
  );
}

function Tile({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="hover:bg-muted/30 transition-colors h-full">
        <CardHeader><div className="flex items-center gap-2 text-primary">{icon}<CardTitle>{title}</CardTitle></div><CardDescription>{desc}</CardDescription></CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
