"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboItem = { value: string; label: string; hint?: string };

/** Normaliza para buscar sin distinguir mayúsculas ni acentos. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Selector con buscador (combobox) para listas largas. Controlado por `value` +
 * `onChange`. Si se pasa `name`, emite un <input type="hidden"> con ese nombre
 * para que funcione dentro de un <form> con FormData (igual que un <select>).
 */
export function SearchableSelect({
  items,
  value,
  onChange,
  name,
  placeholder = "— Selecciona —",
  emptyText = "Sin resultados",
  disabled,
}: {
  items: ComboItem[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    const base = q ? items.filter((i) => norm(i.label).includes(q)) : items;
    return base.slice(0, 200); // tope para no renderizar miles de nodos
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* Los <input type="hidden" required> bloquean el submit en algunos
          navegadores ("not focusable"); la obligatoriedad la valida el servidor. */}
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate text-left", selected ? "" : "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full min-w-[16rem] rounded-md border bg-background shadow-md">
          <div className="flex items-center gap-2 border-b px-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
            )}
            {filtered.map((i) => (
              <button
                key={i.value}
                type="button"
                onClick={() => {
                  onChange(i.value);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <Check className={cn("size-4 shrink-0", i.value === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{i.label}</span>
                {i.hint && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{i.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
