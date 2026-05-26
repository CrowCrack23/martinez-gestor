"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";

export type LineProduct = { id: string; name: string; store: string };
export type InitialLine = { product_id: string; quantity: number; unit_cost: number };

type Row = { uid: number; product_id: string; quantity: string; unit_cost: string };

export function PurchaseLineEditor({
  products,
  initialLines,
}: {
  products: LineProduct[];
  initialLines?: InitialLine[];
}) {
  const seed: Row[] =
    initialLines && initialLines.length > 0
      ? initialLines.map((l, i) => ({
          uid: i + 1,
          product_id: l.product_id,
          quantity: String(l.quantity),
          unit_cost: String(l.unit_cost),
        }))
      : [{ uid: 1, product_id: "", quantity: "1", unit_cost: "0" }];
  const [rows, setRows] = useState<Row[]>(seed);

  const total = useMemo(
    () =>
      rows.reduce((s, r) => {
        const q = Number(r.quantity);
        const c = Number(r.unit_cost);
        return s + (Number.isFinite(q) && Number.isFinite(c) ? q * c : 0);
      }, 0),
    [rows],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Líneas</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((cur) => [...cur, { uid: Date.now(), product_id: "", quantity: "1", unit_cost: "0" }])}
        >
          <Plus className="size-3.5" /> Agregar línea
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((r, idx) => {
          const q = Number(r.quantity);
          const c = Number(r.unit_cost);
          const sub = Number.isFinite(q) && Number.isFinite(c) ? q * c : 0;
          return (
            <div key={r.uid} className="grid grid-cols-[1fr_90px_120px_110px_auto] gap-2 items-start">
              <Select
                name="product_id"
                required
                value={r.product_id}
                onChange={(e) => setRows((cur) => cur.map((x) => (x.uid === r.uid ? { ...x, product_id: e.target.value } : x)))}
              >
                <option value="">— Producto —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>[{p.store}] {p.name}</option>
                ))}
              </Select>
              <Input
                type="number" step="1" min={1} name="quantity" required
                value={r.quantity}
                onChange={(e) => setRows((cur) => cur.map((x) => (x.uid === r.uid ? { ...x, quantity: e.target.value } : x)))}
                placeholder="Cant."
              />
              <Input
                type="number" step="0.01" min={0} name="unit_cost" required
                value={r.unit_cost}
                onChange={(e) => setRows((cur) => cur.map((x) => (x.uid === r.uid ? { ...x, unit_cost: e.target.value } : x)))}
                placeholder="Costo unit."
              />
              <div className="h-10 flex items-center justify-end pr-1 text-sm font-mono text-muted-foreground">
                {formatPrice(sub)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                onClick={() => setRows((cur) => cur.filter((x) => x.uid !== r.uid))}
                aria-label={`Eliminar línea ${idx + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end pt-2 pr-12 text-sm">
        <div className="font-medium">Total: <span className="font-mono">{formatPrice(total)}</span></div>
      </div>
    </div>
  );
}
