"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";

export type LineProduct = { id: string; name: string; store: string | null };
export type InitialComp = { component_product_id: string; quantity_per_unit: number };
type Row = { uid: number; component_product_id: string; quantity_per_unit: string };

export function BomComponentsEditor({
  products, initial,
}: { products: LineProduct[]; initial?: InitialComp[] }) {
  const seed: Row[] = initial && initial.length > 0
    ? initial.map((c, i) => ({ uid: i + 1, component_product_id: c.component_product_id, quantity_per_unit: String(c.quantity_per_unit) }))
    : [{ uid: 1, component_product_id: "", quantity_per_unit: "1" }];
  const [rows, setRows] = useState<Row[]>(seed);
  const productItems = useMemo(
    () => products.map((p) => ({ value: p.id, label: `[${p.store ?? "almacén"}] ${p.name}` })),
    [products],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Insumos por unidad producida</div>
        <Button type="button" variant="outline" size="sm"
          onClick={() => setRows((cur) => [...cur, { uid: Date.now(), component_product_id: "", quantity_per_unit: "1" }])}>
          <Plus className="size-3.5" /> Agregar insumo
        </Button>
      </div>
      <div className="space-y-2 overflow-x-auto">
        {rows.map((r, idx) => (
          <div key={r.uid} className="grid grid-cols-[1fr_140px_auto] gap-2 items-start min-w-[420px]">
            <SearchableSelect name="component_product_id" items={productItems}
              value={r.component_product_id}
              onChange={(v) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, component_product_id: v } : x))} />
            <Input type="number" step="0.0001" min={0.0001} name="quantity_per_unit" required
              value={r.quantity_per_unit}
              onChange={(e) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, quantity_per_unit: e.target.value } : x))}
              placeholder="Cant. por unidad" />
            <Button type="button" variant="ghost" size="icon" disabled={rows.length === 1}
              onClick={() => setRows((cur) => cur.filter((x) => x.uid !== r.uid))}
              aria-label={`Eliminar línea ${idx + 1}`}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Indica cuánto se necesita de cada insumo por <em>unidad de rendimiento</em>. Ej.: si el rendimiento es 10 pizzas y necesitas 150g de queso por pizza, pon 150.
      </p>
    </div>
  );
}
