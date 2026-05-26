"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InventoryMovementType } from "@/lib/supabase-types";

type Warehouse = { id: string; name: string };
type Product = { id: string; name: string; store: string };

type Line = { id: number; product_id: string; quantity: string };

const TYPE_OPTIONS: { value: InventoryMovementType; label: string; help: string }[] = [
  { value: "entrada",       label: "Entrada",       help: "Ingreso de stock a un almacén (compra, devolución, etc.)" },
  { value: "salida",        label: "Salida",        help: "Salida de stock por venta u otro motivo" },
  { value: "transferencia", label: "Transferencia", help: "Mover stock entre dos almacenes" },
  { value: "ajuste",        label: "Ajuste",        help: "Corrección de inventario (cantidad puede ser negativa)" },
  { value: "merma",         label: "Merma",         help: "Pérdida o daño de producto" },
];

export function MovementForm({
  warehouses,
  products,
  action,
}: {
  warehouses: Warehouse[];
  products: Product[];
  action: (formData: FormData) => void;
}) {
  const [type, setType] = useState<InventoryMovementType>("entrada");
  const [lines, setLines] = useState<Line[]>([{ id: 1, product_id: "", quantity: "1" }]);

  const needsFrom = type === "salida" || type === "merma" || type === "transferencia";
  const needsTo = type === "entrada" || type === "transferencia" || type === "ajuste";
  const allowNegative = type === "ajuste";
  const help = TYPE_OPTIONS.find((t) => t.value === type)?.help;

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as InventoryMovementType)}>
          {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="warehouse_from">Origen {needsFrom && <span className="text-destructive">*</span>}</Label>
          <Select id="warehouse_from" name="warehouse_from" disabled={!needsFrom} required={needsFrom} defaultValue="">
            <option value="">{needsFrom ? "— Selecciona —" : "— N/A —"}</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="warehouse_to">Destino {needsTo && <span className="text-destructive">*</span>}</Label>
          <Select id="warehouse_to" name="warehouse_to" disabled={!needsTo} required={needsTo} defaultValue="">
            <option value="">{needsTo ? "— Selecciona —" : "— N/A —"}</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Líneas</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLines((cur) => [...cur, { id: Date.now(), product_id: "", quantity: "1" }])}
          >
            <Plus className="size-3.5" /> Agregar línea
          </Button>
        </div>
        <div className="space-y-2">
          {lines.map((line, idx) => (
            <div key={line.id} className="flex gap-2 items-start">
              <div className="flex-1">
                <Select
                  name="product_id"
                  required
                  value={line.product_id}
                  onChange={(e) => setLines((cur) => cur.map((l) => (l.id === line.id ? { ...l, product_id: e.target.value } : l)))}
                >
                  <option value="">— Producto —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.store}] {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-32">
                <Input
                  type="number"
                  step="1"
                  min={allowNegative ? undefined : 1}
                  name="quantity"
                  required
                  value={line.quantity}
                  onChange={(e) => setLines((cur) => cur.map((l) => (l.id === line.id ? { ...l, quantity: e.target.value } : l)))}
                  placeholder={allowNegative ? "±n" : "n"}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={lines.length === 1}
                onClick={() => setLines((cur) => cur.filter((l) => l.id !== line.id))}
                aria-label={`Eliminar línea ${idx + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
        {allowNegative && (
          <p className="text-xs text-muted-foreground">En ajustes, usa cantidades negativas para reducir stock y positivas para aumentar.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Referencia, motivo, observaciones..." />
      </div>

      <div className="flex justify-end">
        <Button type="submit">Registrar movimiento</Button>
      </div>
    </form>
  );
}
