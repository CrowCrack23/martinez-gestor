"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/searchable-select";
import { formatPrice } from "@/lib/format";

export type LineProduct = { id: string; name: string; store: string | null; price: number };
export type InitialLine = { product_id: string; quantity: number };

type Row = { uid: number; product_id: string; quantity: string };

/**
 * Editor de líneas de venta — USD funcional: el precio NO se escribe; se
 * calcula desde el precio USD del producto × tasa del día (múltiplo de 5 CUP
 * hacia arriba). Al confirmar, el servidor lo recalcula igual (anti-error).
 */
export function OrderLineEditor({
  products,
  initialLines,
  rate,
}: {
  products: LineProduct[];
  initialLines?: InitialLine[];
  /** Tasa USD→CUP del día; sin tasa los precios se muestran como "—". */
  rate?: number | null;
}) {
  const seed: Row[] =
    initialLines && initialLines.length > 0
      ? initialLines.map((l, i) => ({ uid: i + 1, product_id: l.product_id, quantity: String(l.quantity) }))
      : [{ uid: 1, product_id: "", quantity: "1" }];
  const [rows, setRows] = useState<Row[]>(seed);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productItems = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: `[${p.store ?? "almacén"}] ${p.name}`,
        hint: p.price > 0 ? `${formatPrice(p.price)} USD` : "sin precio",
      })),
    [products],
  );
  // Espejo de priceCupFromUsd (lib/currency.ts) — múltiplo de 5 hacia arriba.
  const priceCup = (productId: string): number | null => {
    const p = productById.get(productId);
    if (!p || !rate || p.price <= 0) return null;
    return Math.ceil((p.price * rate) / 5) * 5;
  };

  const total = useMemo(
    () =>
      rows.reduce((s, r) => {
        const q = Number(r.quantity);
        const c = priceCup(r.product_id) ?? 0;
        return s + (Number.isFinite(q) ? q * c : 0);
      }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rate, products],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Líneas{" "}
          <span className="font-normal text-muted-foreground">
            (precio = USD × tasa{rate ? ` ${rate}` : ""}, redondeado a 5 CUP)
          </span>
        </div>
        <Button
          type="button" variant="outline" size="sm"
          onClick={() => setRows((cur) => [...cur, { uid: Date.now(), product_id: "", quantity: "1" }])}
        >
          <Plus className="size-3.5" /> Agregar línea
        </Button>
      </div>
      <div className="space-y-2 overflow-x-auto">
        {rows.map((r, idx) => {
          const q = Number(r.quantity);
          const unit = priceCup(r.product_id);
          const sub = unit != null && Number.isFinite(q) ? q * unit : 0;
          const p = productById.get(r.product_id);
          return (
            <div key={r.uid} className="grid grid-cols-[1fr_90px_130px_110px_auto] gap-2 items-start min-w-[560px]">
              <SearchableSelect
                name="product_id"
                items={productItems}
                value={r.product_id}
                onChange={(v) => setRows((cur) => cur.map((x) => (x.uid === r.uid ? { ...x, product_id: v } : x)))}
              />
              <Input
                type="number" step="any" min={0} name="quantity" required
                value={r.quantity}
                onChange={(e) => setRows((cur) => cur.map((x) => (x.uid === r.uid ? { ...x, quantity: e.target.value } : x)))}
                placeholder="Cant."
              />
              <div className="h-10 flex flex-col items-end justify-center rounded-md border bg-muted/40 px-3 font-mono text-sm">
                {unit != null ? (
                  <>
                    <span>{unit} CUP</span>
                    {p ? <span className="text-[10px] text-muted-foreground">{formatPrice(p.price)} USD</span> : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">{r.product_id ? (rate ? "sin precio USD" : "sin tasa") : "—"}</span>
                )}
                {/* El precio viaja calculado; el servidor lo recalcula al confirmar. */}
                <input type="hidden" name="unit_price" value={unit ?? 0} />
              </div>
              <div className="h-10 flex items-center justify-end pr-1 text-sm font-mono text-muted-foreground">
                {formatPrice(sub)}
              </div>
              <Button
                type="button" variant="ghost" size="icon"
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
        <div className="font-medium">Total: <span className="font-mono">{formatPrice(total)} CUP</span></div>
      </div>
    </div>
  );
}
