import Link from "next/link";
import { getCurrentRate, RATE_STALE_DAYS } from "@/lib/currency";

/**
 * Banner de la tasa USD→CUP del día (server component).
 * - Verde/neutro: tasa de hoy.
 * - Amarillo: tasa de 1–{RATE_STALE_DAYS} días (se puede operar, conviene actualizar).
 * - Rojo: sin tasa o con más de {RATE_STALE_DAYS} días → las operaciones se bloquean.
 */
export async function RateBanner() {
  const current = await getCurrentRate();

  if (!current) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 text-sm px-3 py-2">
        No hay tasa USD→CUP registrada. Las compras y ventas están bloqueadas hasta registrarla en{" "}
        <Link href="/remesas/tasas" className="underline font-medium">/remesas/tasas</Link>.
      </div>
    );
  }
  if (current.stale) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 text-sm px-3 py-2">
        La última tasa USD→CUP ({current.rate}) es del {current.day} — más de {RATE_STALE_DAYS} días.
        Las compras y ventas están bloqueadas hasta registrar la tasa del día en{" "}
        <Link href="/remesas/tasas" className="underline font-medium">/remesas/tasas</Link>.
      </div>
    );
  }
  if (current.ageDays > 0) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning/10 text-sm px-3 py-2">
        Tasa del día: <span className="font-mono font-medium">{current.rate} CUP/USD</span> (del {current.day},
        hace {current.ageDays} {current.ageDays === 1 ? "día" : "días"}).{" "}
        <Link href="/remesas/tasas" className="underline">Actualizar</Link>.
      </div>
    );
  }
  return (
    <div className="rounded-md border bg-muted/40 text-sm px-3 py-2">
      Tasa del día: <span className="font-mono font-medium">{current.rate} CUP/USD</span> (hoy).
    </div>
  );
}
