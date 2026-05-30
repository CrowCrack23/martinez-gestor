"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

// Selector de negocio para los reportes de contabilidad. Navega preservando los
// demás parámetros de la URL. Opción vacía = consolidado (todos los negocios del
// alcance del usuario).
export function BusinessFilter({
  businesses,
  consolidatedLabel = "— Consolidado —",
}: {
  businesses: { slug: string; label: string }[];
  consolidatedLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("business") ?? "";

  function onChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set("business", value);
    else next.delete("business");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select
      aria-label="Negocio"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-auto min-w-[12rem]"
    >
      <option value="">{consolidatedLabel}</option>
      {businesses.map((b) => (
        <option key={b.slug} value={b.slug}>{b.label}</option>
      ))}
    </Select>
  );
}
