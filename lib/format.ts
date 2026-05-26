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

export function formatPrice(n: number): string {
  return PRICE_FMT.format(n);
}

export function formatDateTime(d: string | Date): string {
  return DATETIME_FMT.format(typeof d === "string" ? new Date(d) : d);
}
