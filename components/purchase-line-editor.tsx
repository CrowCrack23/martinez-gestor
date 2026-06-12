"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type LineProduct = { id: string; name: string; store: string | null };
export type InitialLine = { product_id: string; quantity: number; unit_cost_usd: number | null };

type Mode = "existente" | "nuevo";
type Row = {
  uid: number;
  mode: Mode;
  product_id: string;
  quantity: string;
  unit_cost_usd: string;
  new_name: string;
  new_price_usd: string;
};

function emptyRow(uid: number): Row {
  return { uid, mode: "existente", product_id: "", quantity: "1", unit_cost_usd: "0", new_name: "", new_price_usd: "" };
}

const fmtUsd = (n: number) =>
  `${new Intl.NumberFormat("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} USD`;
const fmtCup = (n: number) => `${new Intl.NumberFormat("es-CU", { maximumFractionDigits: 0 }).format(n)} CUP`;

/**
 * Editor de líneas de compra — USD funcional: el costo se captura EN DÓLARES
 * (la cifra real del negocio); el equivalente CUP se muestra con la tasa del
 * día y queda congelado en la orden al guardarla.
 */
export function PurchaseLineEditor({
  products,
  initialLines,
  rate,
}: {
  products: LineProduct[];
  initialLines?: InitialLine[];
  /** Tasa USD→CUP del día (solo para mostrar equivalentes). */
  rate?: number | null;
}) {
  const seed: Row[] =
    initialLines && initialLines.length > 0
      ? initialLines.map((l, i) => ({
          ...emptyRow(i + 1),
          product_id: l.product_id,
          quantity: String(l.quantity),
          unit_cost_usd: String(l.unit_cost_usd ?? 0),
        }))
      : [emptyRow(1)];
  const [rows, setRows] = useState<Row[]>(seed);

  const patch = (uid: number, p: Partial<Row>) =>
    setRows((cur) => cur.map((x) => (x.uid === uid ? { ...x, ...p } : x)));

  const totalUsd = useMemo(
    () =>
      rows.reduce((s, r) => {
        const q = Number(r.quantity);
        const c = Number(r.unit_cost_usd);
        return s + (Number.isFinite(q) && Number.isFinite(c) ? q * c : 0);
      }, 0),
    [rows],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          Líneas <span className="font-normal text-muted-foreground">(costos en USD)</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((cur) => [...cur, emptyRow(Date.now())])}
        >
          <Plus className="size-3.5" /> Agregar línea
        </Button>
      </div>
      <div className="space-y-2 overflow-x-auto">
        {rows.map((r, idx) => {
          const q = Number(r.quantity);
          const c = Number(r.unit_cost_usd);
          const sub = Number.isFinite(q) && Number.isFinite(c) ? q * c : 0;
          const nuevo = r.mode === "nuevo";
          return (
            <div key={r.uid} className="space-y-1.5 rounded-md border p-2 min-w-[560px]">
              <div className="grid grid-cols-[110px_1fr_90px_120px_110px_auto] gap-2 items-start">
                <Select
                  name="line_mode"
                  value={r.mode}
                  onChange={(e) => patch(r.uid, { mode: e.target.value as Mode, product_id: "", new_name: "" })}
                  aria-label={`Tipo de línea ${idx + 1}`}
                >
                  <option value="existente">Existente</option>
                  <option value="nuevo">Nuevo</option>
                </Select>
                {nuevo ? (
                  <>
                    {/* product_id vacío para mantener los arrays del form alineados */}
                    <input type="hidden" name="product_id" value="" />
                    <Input
                      name="new_name"
                      required
                      placeholder="Nombre del producto nuevo"
                      value={r.new_name}
                      onChange={(e) => patch(r.uid, { new_name: e.target.value })}
                    />
                  </>
                ) : (
                  <>
                    <Select
                      name="product_id"
                      required
                      value={r.product_id}
                      onChange={(e) => patch(r.uid, { product_id: e.target.value })}
                    >
                      <option value="">— Producto —</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>[{p.store ?? "almacén"}] {p.name}</option>
                      ))}
                    </Select>
                    <input type="hidden" name="new_name" value="" />
                  </>
                )}
                <Input
                  type="number" step="1" min={1} name="quantity" required
                  value={r.quantity}
                  onChange={(e) => patch(r.uid, { quantity: e.target.value })}
                  placeholder="Cant."
                />
                <Input
                  type="number" step="any" min={0} name="unit_cost_usd" required
                  value={r.unit_cost_usd}
                  onChange={(e) => patch(r.uid, { unit_cost_usd: e.target.value })}
                  placeholder="Costo USD"
                />
                <div className="h-10 flex flex-col items-end justify-center pr-1 text-sm font-mono text-muted-foreground">
                  <span>{fmtUsd(sub)}</span>
                  {rate ? <span className="text-xs">≈ {fmtCup(sub * rate)}</span> : null}
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
              {nuevo ? (
                <div className="grid grid-cols-[110px_1fr_1fr] gap-2 items-center text-xs">
                  <div className="text-muted-foreground pl-1">Producto nuevo:</div>
                  <Input
                    type="number" step="any" min={0} name="new_price_usd"
                    placeholder="Precio de venta USD (opcional)"
                    value={r.new_price_usd}
                    onChange={(e) => patch(r.uid, { new_price_usd: e.target.value })}
                  />
                  <div className="text-muted-foreground">
                    Se crea sin tienda (solo almacén). El precio CUP se calcula solo con la tasa del día.
                  </div>
                </div>
              ) : (
                <input type="hidden" name="new_price_usd" value="" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col items-end pt-2 pr-12 text-sm">
        <div className="font-medium">Total: <span className="font-mono">{fmtUsd(totalUsd)}</span></div>
        {rate ? (
          <div className="text-xs text-muted-foreground">
            ≈ <span className="font-mono">{fmtCup(totalUsd * rate)}</span> a tasa {rate}
          </div>
        ) : null}
      </div>
    </div>
  );
}
