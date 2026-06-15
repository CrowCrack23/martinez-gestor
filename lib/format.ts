const NUMBER_FMT = new Intl.NumberFormat("es-CU", {
  maximumFractionDigits: 0,
});

const PRICE_FMT = new Intl.NumberFormat("es-CU", {
  style: "currency",
  currency: "CUP",
  maximumFractionDigits: 2,
});

const DATETIME_FMT = new Intl.DateTimeFormat("es-CU", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatNumber(n: number): string {
  return NUMBER_FMT.format(n);
}

const QTY_FMT = new Intl.NumberFormat("es-CU", {
  maximumFractionDigits: 3, // cantidades de inventario: enteras o con coma (insumos)
});

/** Formatea una CANTIDAD de inventario (entera o hasta 3 decimales, sin ceros sobrantes). */
export function formatQty(n: number): string {
  return QTY_FMT.format(n);
}

export function formatPrice(n: number): string {
  return PRICE_FMT.format(n);
}

const UNIT_FMT = new Intl.NumberFormat("es-CU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6, // costos/precios unitarios: muestra hasta 6 decimales
});

/** Formatea un costo/precio UNITARIO conservando sus decimales (2 a 6). */
export function formatUnit(n: number): string {
  return UNIT_FMT.format(n);
}

export function formatDateTime(d: string | Date): string {
  return DATETIME_FMT.format(typeof d === "string" ? new Date(d) : d);
}
