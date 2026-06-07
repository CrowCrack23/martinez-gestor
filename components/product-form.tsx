"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type StoreOpt = { slug: string; label: string };
type CatOpt = { name: string; store: string };

export type ProductFormInitial = {
  name: string;
  description: string;
  price: number;
  price_eur: number | null;
  old_price: number | null;
  image: string;
  category: string | null;
  store: string | null;
  shipping_time: string | null;
  featured: boolean;
  is_new: boolean;
  online_visible: boolean;
};

export function ProductForm({
  action,
  stores,
  categories,
  initial,
  submitLabel,
  rate,
}: {
  action: (formData: FormData) => void;
  stores: StoreOpt[];
  categories: CatOpt[];
  initial?: ProductFormInitial;
  submitLabel: string;
  /** Tasa USD→CUP del día (solo para previsualizar el precio CUP calculado). */
  rate?: number | null;
}) {
  // "" = sin tienda (solo almacén): no se vende online y la categoría es opcional.
  const [store, setStore] = useState(initial ? (initial.store ?? "") : (stores[0]?.slug ?? ""));
  const [priceUsd, setPriceUsd] = useState(initial?.price != null ? String(initial.price) : "");
  const hasStore = store !== "";
  const cats = categories.filter((c) => c.store === store);
  const usd = Number(priceUsd);
  const cupPreview =
    rate && Number.isFinite(usd) && usd > 0 ? Math.ceil((usd * rate) / 5) * 5 : null;

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" name="name" required defaultValue={initial?.name ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="price">Precio (USD) *</Label>
          <Input
            id="price" name="price" type="number" step="0.01" min="0" required
            value={priceUsd}
            onChange={(e) => setPriceUsd(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Único precio que se define: el dólar manda.</p>
        </div>
        <div className="space-y-2">
          <Label>Precio CUP (hoy)</Label>
          <div className="h-10 flex items-center rounded-md border bg-muted/40 px-3 font-mono text-sm">
            {cupPreview != null ? `${cupPreview} CUP` : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            Calculado solo: USD × tasa del día{rate ? ` (${rate})` : ""}, redondeado a múltiplo de 5.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="price_eur">Precio (EUR)</Label>
          <Input id="price_eur" name="price_eur" type="number" step="0.01" min="0" defaultValue={initial?.price_eur ?? ""} />
          <p className="text-xs text-muted-foreground">Solo tienda online en euros.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="old_price">Precio anterior (opcional)</Label>
          <Input id="old_price" name="old_price" type="number" step="0.01" min="0" defaultValue={initial?.old_price ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="store">Tienda</Label>
          <Select id="store" name="store" value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">— Sin tienda (solo almacén) —</option>
            {stores.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
          </Select>
          {!hasStore && (
            <p className="text-xs text-muted-foreground">El producto vive en el almacén (compras/inventario) y no se vende online.</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Categoría{hasStore ? " *" : ""}</Label>
          <Select id="category" name="category" required={hasStore} disabled={!hasStore} defaultValue={initial?.category ?? ""} key={store}>
            <option value="">— Selecciona —</option>
            {cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </Select>
          {hasStore && cats.length === 0 && (
            <p className="text-xs text-muted-foreground">Esta tienda no tiene categorías. Créalas en el admin de la tienda.</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="image">Imagen (URL)</Label>
        <Input id="image" name="image" placeholder="https://..." defaultValue={initial?.image ?? ""} />
        <p className="text-xs text-muted-foreground">Debe ser de un host permitido (Supabase Storage o el configurado en la tienda).</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="shipping_time">Tiempo de entrega (opcional)</Label>
        <Input id="shipping_time" name="shipping_time" placeholder="Ej: 24-48h" defaultValue={initial?.shipping_time ?? ""} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={initial?.description ?? ""} />
      </div>

      <div className="flex flex-wrap gap-5 pt-1">
        <label className={`flex items-center gap-2 text-sm ${!hasStore ? "opacity-50" : ""}`}>
          <input type="checkbox" name="online_visible" value="1" disabled={!hasStore} defaultChecked={initial ? initial.online_visible : true} className="size-4" />
          Se vende online{!hasStore ? " (requiere tienda)" : ""}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="featured" value="1" defaultChecked={initial?.featured ?? false} className="size-4" />
          Destacado
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_new" value="1" defaultChecked={initial?.is_new ?? false} className="size-4" />
          Nuevo
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
