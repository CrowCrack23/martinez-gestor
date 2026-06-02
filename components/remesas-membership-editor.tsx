"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Sección "Acceso a Remesas" para el formulario de usuarios. Asigna el rol del
// usuario DENTRO del negocio "remesas" (modelo por membresía, migración 0022) y,
// si es gestor, su % de comisión. Envía:
//   - remesas_roles[]        (checkboxes)
//   - gestor_commission_pct  (number, solo visible si gestor)

const ROLES: { id: string; label: string; desc: string }[] = [
  { id: "encargado_remesas", label: "Encargado", desc: "Gestiona todo el negocio de remesas (tasas, asignaciones, ve todas)." },
  { id: "gestor", label: "Gestor", desc: "Capta clientes; crea y ve sus propias remesas. Gana comisión." },
  { id: "mensajero", label: "Mensajero", desc: "Entrega el dinero; ve solo las remesas asignadas a él." },
];

export function RemesasMembershipEditor({
  initialRoles = [],
  initialCommissionPct = 0,
}: {
  initialRoles?: string[];
  initialCommissionPct?: number;
}) {
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const toggle = (id: string) =>
    setRoles((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  const isGestor = roles.includes("gestor");

  return (
    <div className="space-y-2">
      <Label>Acceso a Remesas</Label>
      <p className="text-xs text-muted-foreground">
        Rol del usuario dentro del negocio de remesas (también le da acceso a la app móvil).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ROLES.map((r) => (
          <label
            key={r.id}
            className="flex items-start gap-2 p-2 border rounded-md text-sm hover:bg-muted/30 cursor-pointer">
            <input
              type="checkbox"
              name="remesas_roles"
              value={r.id}
              checked={roles.includes(r.id)}
              onChange={() => toggle(r.id)}
              className="mt-0.5 size-4"
            />
            <div>
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
          </label>
        ))}
      </div>
      {isGestor && (
        <div className="space-y-1 max-w-xs pt-1">
          <Label htmlFor="gestor_commission_pct">% de comisión del gestor</Label>
          <Input
            id="gestor_commission_pct"
            name="gestor_commission_pct"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={String(initialCommissionPct)}
          />
          <p className="text-xs text-muted-foreground">
            Porcentaje sobre la comisión cobrada al cliente en cada remesa que trae.
          </p>
        </div>
      )}
    </div>
  );
}
