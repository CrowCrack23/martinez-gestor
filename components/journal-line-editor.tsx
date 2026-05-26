"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";

export type AccountOption = { id: string; code: string; name: string };
export type InitialLine = { account_id: string; debit: number; credit: number; description: string };
type Row = { uid: number; account_id: string; debit: string; credit: string; description: string };

export function JournalLineEditor({
  accounts, initial,
}: { accounts: AccountOption[]; initial?: InitialLine[] }) {
  const seed: Row[] = initial && initial.length > 0
    ? initial.map((l, i) => ({ uid: i + 1, account_id: l.account_id, debit: String(l.debit || ""), credit: String(l.credit || ""), description: l.description }))
    : [
        { uid: 1, account_id: "", debit: "", credit: "", description: "" },
        { uid: 2, account_id: "", debit: "", credit: "", description: "" },
      ];
  const [rows, setRows] = useState<Row[]>(seed);

  const totals = useMemo(() => {
    let d = 0, c = 0;
    for (const r of rows) {
      const dn = Number(r.debit) || 0;
      const cn = Number(r.credit) || 0;
      d += dn; c += cn;
    }
    return { d, c, diff: Math.round((d - c) * 100) / 100 };
  }, [rows]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Líneas (partida doble)</div>
        <Button type="button" variant="outline" size="sm"
          onClick={() => setRows((cur) => [...cur, { uid: Date.now(), account_id: "", debit: "", credit: "", description: "" }])}>
          <Plus className="size-3.5" /> Agregar línea
        </Button>
      </div>
      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.uid} className="grid grid-cols-[1fr_1fr_120px_120px_auto] gap-2 items-start">
            <Select name="account_id" required value={r.account_id}
              onChange={(e) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, account_id: e.target.value } : x))}>
              <option value="">— Cuenta —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </Select>
            <Input name="line_description" placeholder="Descripción línea" value={r.description}
              onChange={(e) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, description: e.target.value } : x))} />
            <Input type="number" step="0.01" min={0} name="debit" placeholder="Debe" value={r.debit}
              onChange={(e) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, debit: e.target.value, credit: e.target.value ? "" : x.credit } : x))} />
            <Input type="number" step="0.01" min={0} name="credit" placeholder="Haber" value={r.credit}
              onChange={(e) => setRows((cur) => cur.map((x) => x.uid === r.uid ? { ...x, credit: e.target.value, debit: e.target.value ? "" : x.debit } : x))} />
            <Button type="button" variant="ghost" size="icon" disabled={rows.length <= 2}
              onClick={() => setRows((cur) => cur.filter((x) => x.uid !== r.uid))}
              aria-label={`Eliminar línea ${idx + 1}`}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-6 pt-2 pr-12 text-sm">
        <div>Debe: <span className="font-mono">{formatPrice(totals.d)}</span></div>
        <div>Haber: <span className="font-mono">{formatPrice(totals.c)}</span></div>
        <div className={totals.diff === 0 ? "text-success" : "text-destructive font-medium"}>
          Diferencia: <span className="font-mono">{formatPrice(totals.diff)}</span>
        </div>
      </div>
    </div>
  );
}
