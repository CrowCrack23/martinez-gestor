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
  "cuadres",
  "puntos_venta",
  "clientes",
  "empleados",
  "asistencia",
  "nomina",
  "recetas",
  "produccion",
  "remesas",
  "contabilidad",
  "socios",
  "capital",
  "usuarios",
  "asistente",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Roles del negocio "remesas" (modelo por membresía, migración 0022). Se asignan
 * por negocio en business_members, NO como roles globales — por eso se excluyen
 * de la lista de roles globales en la UI de /usuarios.
 */
export const REMESAS_ROLES = ["encargado_remesas", "gestor", "mensajero"] as const;
export type RemesasRole = (typeof REMESAS_ROLES)[number];

export type RoleId =
  | "admin"
  | "almacenero"
  | "vendedor"
  | "contador"
  | "rrhh"
  | "mensajero"
  | "gestor"
  | "encargado_remesas";

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
  vendedor: ["inventario", "ventas", "cuadres", "clientes", "remesas"],
  contador: [
    "lotes",
    "proveedores",
    "compras",
    "ventas",
    "cuadres",
    "clientes",
    "nomina",
    "remesas",
    "contabilidad",
    "capital",
  ],
  rrhh: ["empleados", "asistencia", "nomina"],
  // Roles del negocio "remesas" (modelo por membresía, migración 0022). Todos
  // entran al módulo remesas; el alcance fino (qué remesas ve/opera cada uno) lo
  // imponen la RLS y las páginas según su rol dentro del negocio.
  mensajero: ["remesas"],
  gestor: ["remesas"],
  encargado_remesas: ["remesas"],
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

/**
 * Ruta principal de cada permiso (para mandar a un usuario a su primera sección
 * accesible). El orden de `PERMISSIONS` define la prioridad de aterrizaje.
 */
export const PERMISSION_HOME: Record<Permission, string> = {
  productos: "/productos",
  inventario: "/inventario",
  movimientos: "/inventario/movimientos",
  lotes: "/inventario/lotes",
  almacenes: "/almacenes",
  proveedores: "/proveedores",
  compras: "/compras",
  ventas: "/ventas",
  cuadres: "/cuadres",
  puntos_venta: "/puntos-venta",
  clientes: "/clientes",
  empleados: "/empleados",
  asistencia: "/asistencia",
  nomina: "/nomina",
  recetas: "/recetas",
  produccion: "/produccion",
  remesas: "/remesas",
  contabilidad: "/contabilidad",
  socios: "/socios",
  capital: "/capital",
  usuarios: "/usuarios",
  asistente: "/asistente",
};

/**
 * A dónde mandar a un usuario al entrar: el dashboard `/` es solo para admin;
 * el resto cae en su primera sección permitida. Si no tiene ninguna, a /sin-acceso.
 */
export function landingPathForRoles(roles: string[]): string {
  if (roles.includes("admin")) return "/";
  const perms = permissionsForRoles(roles);
  if (perms === "all") return "/";
  for (const p of PERMISSIONS) {
    if (perms.has(p)) return PERMISSION_HOME[p];
  }
  return "/sin-acceso";
}

/** Etiqueta legible de cada rol (para la UI de usuarios). */
export const ROLE_LABEL: Record<RoleId, string> = {
  admin: "Administrador",
  almacenero: "Almacenero",
  vendedor: "Vendedor",
  contador: "Contador",
  rrhh: "Recursos Humanos",
  mensajero: "Mensajero",
  gestor: "Gestor",
  encargado_remesas: "Encargado de remesas",
};
