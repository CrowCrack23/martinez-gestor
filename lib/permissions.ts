// Fuente única de verdad para el control de acceso por módulo.
//
// El modelo es "por módulo": cada permiso representa el acceso a una sección
// del ERP. Un rol agrupa permisos. Tanto el sidebar (qué se ve) como los guards
// de las páginas (requirePermission) leen de esta misma matriz, así no pueden
// divergir.
//
// Roles fijos (seed en migración 0005). Para cambiar qué hace un rol, edita
// ROLE_PERMISSIONS aquí — no hay que tocar las páginas ni el sidebar.
//
// Nota: restricciones más finas de escritura (p.ej. "solo admin elimina",
// "el contador ve ventas pero no las crea") se mantienen como checks de rol
// explícitos dentro de las server actions correspondientes. El permiso de
// módulo solo controla la *entrada* a la sección.

export const PERMISSIONS = [
  "productos",
  "inventario",
  "movimientos",
  "lotes",
  "almacenes",
  "proveedores",
  "compras",
  "ventas",
  "clientes",
  "empleados",
  "asistencia",
  "nomina",
  "recetas",
  "produccion",
  "remesas",
  "contabilidad",
  "usuarios",
  "asistente",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleId = "admin" | "almacenero" | "vendedor" | "contador" | "rrhh";

const ALL = "*" as const;

/**
 * Matriz rol → permisos. `admin` tiene acceso total (`"*"`).
 * El resto se deriva de qué módulos opera cada rol.
 */
export const ROLE_PERMISSIONS: Record<RoleId, Permission[] | typeof ALL> = {
  admin: ALL,
  almacenero: [
    "productos",
    "inventario",
    "movimientos",
    "lotes",
    "almacenes",
    "proveedores",
    "compras",
    "recetas",
    "produccion",
  ],
  vendedor: ["inventario", "ventas", "clientes", "remesas"],
  contador: [
    "lotes",
    "proveedores",
    "compras",
    "ventas",
    "clientes",
    "nomina",
    "remesas",
    "contabilidad",
  ],
  rrhh: ["empleados", "asistencia", "nomina"],
};

/** Conjunto de permisos efectivos de un usuario según sus roles. */
export function permissionsForRoles(roles: string[]): Set<Permission> | "all" {
  for (const r of roles) {
    if (ROLE_PERMISSIONS[r as RoleId] === ALL) return "all";
  }
  const set = new Set<Permission>();
  for (const r of roles) {
    const perms = ROLE_PERMISSIONS[r as RoleId];
    if (Array.isArray(perms)) for (const p of perms) set.add(p);
  }
  return set;
}

/** ¿Los roles dados conceden el permiso indicado? */
export function roleListHasPermission(roles: string[], perm: Permission): boolean {
  const p = permissionsForRoles(roles);
  return p === "all" || p.has(perm);
}

/** Etiqueta legible de cada rol (para la UI de usuarios). */
export const ROLE_LABEL: Record<RoleId, string> = {
  admin: "Administrador",
  almacenero: "Almacenero",
  vendedor: "Vendedor",
  contador: "Contador",
  rrhh: "Recursos Humanos",
};
