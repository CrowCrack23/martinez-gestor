import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requirePermission } from "@/lib/auth";
import { getBom, getProductionOrder, PRODUCTION_STATUS_BADGE, PRODUCTION_STATUS_LABEL } from "@/lib/production";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Flash } from "@/components/flash";
import { formatDateTime } from "@/lib/format";
import { cancelProductionOrderAction, deleteProductionOrderAction, produceOrderAction } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ success?: string; error?: string }>;

export default async function ProduccionDetallePage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requirePermission("produccion");
  const canDelete = hasRole(user, ["admin"]);
  const { id } = await params;
  const [po, sp] = await Promise.all([getProductionOrder(id), searchParams]);
  if (!po) notFound();
  const bom = await getBom(po.bom_id);
  const editable = po.status === "borrador";

  const produce = produceOrderAction.bind(null, po.id);
  const cancel = cancelProductionOrderAction.bind(null, po.id);
  const remove = deleteProductionOrderAction.bind(null, po.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold font-mono">{po.code}</h1>
          <div className="mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${PRODUCTION_STATUS_BADGE[po.status]}`}>
              {PRODUCTION_STATUS_LABEL[po.status]}
            </span>
          </div>
        </div>
      </div>
      <Flash success={sp.success} error={sp.error} />
      <Card>
        <CardContent className="pt-6 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><div className="text-muted-foreground text-xs">Receta</div><div>{po.bom_name}</div></div>
            <div><div className="text-muted-foreground text-xs">Producto terminado</div><div>{po.finished_product_name}</div></div>
            <div><div className="text-muted-foreground text-xs">Almacén</div><div>{po.warehouse_name}</div></div>
            <div><div className="text-muted-foreground text-xs">Cantidad (vueltas)</div><div className="font-mono">{po.quantity}</div></div>
            <div><div className="text-muted-foreground text-xs">Creada</div><div>{formatDateTime(po.created_at)}</div></div>
            {po.produced_at && <div><div className="text-muted-foreground text-xs">Producida</div><div>{formatDateTime(po.produced_at)}</div></div>}
          </div>
          {po.notes && <div><div className="text-muted-foreground text-xs mb-1">Notas</div>{po.notes}</div>}
        </CardContent>
      </Card>

      {bom && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-medium mb-2">Insumos a consumir</div>
            <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1">Producto</th><th className="py-1 text-right">x unidad</th><th className="py-1 text-right">Total</th></tr>
              </thead>
              <tbody>
                {bom.components.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1">{c.component_name}</td>
                    <td className="py-1 text-right font-mono">{c.quantity_per_unit}</td>
                    <td className="py-1 text-right font-mono">{(Number(c.quantity_per_unit) * Number(po.quantity)).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t font-medium">
                  <td className="py-2">{po.finished_product_name} (a producir)</td>
                  <td></td>
                  <td className="py-2 text-right font-mono">{Math.floor(Number(bom.yield) * Number(po.quantity))}</td>
                </tr>
              </tbody>
            </table>
        </div>
          </CardContent>
        </Card>
      )}

      {editable && (
        <>
          <Card>
            <CardContent className="pt-6 flex flex-wrap gap-3 items-center justify-between">
              <div>
                <div className="font-medium">Producir</div>
                <div className="text-sm text-muted-foreground">Genera la salida de insumos y la entrada del producto terminado.</div>
              </div>
              <form action={produce}><Button type="submit">Producir ahora</Button></form>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="pt-6 flex items-center justify-between">
              <div><div className="font-medium">Cancelar / eliminar</div><div className="text-sm text-muted-foreground">Cancelar deja en historial.</div></div>
              <div className="flex gap-2">
                <form action={cancel}><Button type="submit" variant="outline">Cancelar</Button></form>
                {canDelete && <form action={remove}><Button type="submit" variant="destructive">Eliminar</Button></form>}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      <div><Button asChild variant="ghost"><Link href="/produccion">← Volver</Link></Button></div>
    </div>
  );
}
