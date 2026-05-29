"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Warehouse,
  Boxes,
  Package,
  ArrowLeftRight,
  Layers,
  Truck,
  ShoppingCart,
  Receipt,
  UserRound,
  Briefcase,
  CalendarCheck,
  Wallet,
  ChefHat,
  Factory,
  Send,
  Calculator,
  Sparkles,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { roleListHasPermission, type Permission } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission; // sin permiso = visible para cualquier usuario autenticado
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/productos", label: "Productos", icon: Package, permission: "productos" },
  { href: "/inventario", label: "Inventario", icon: Boxes, permission: "inventario" },
  { href: "/inventario/movimientos", label: "Movimientos", icon: ArrowLeftRight, permission: "movimientos" },
  { href: "/inventario/lotes", label: "Lotes y costos", icon: Layers, permission: "lotes" },
  { href: "/almacenes", label: "Almacenes", icon: Warehouse, permission: "almacenes" },
  { href: "/proveedores", label: "Proveedores", icon: Truck, permission: "proveedores" },
  { href: "/compras", label: "Compras", icon: ShoppingCart, permission: "compras" },
  { href: "/ventas", label: "Ventas", icon: Receipt, permission: "ventas" },
  { href: "/clientes", label: "Clientes", icon: UserRound, permission: "clientes" },
  { href: "/empleados", label: "Empleados", icon: Briefcase, permission: "empleados" },
  { href: "/asistencia", label: "Asistencia", icon: CalendarCheck, permission: "asistencia" },
  { href: "/nomina", label: "Nómina", icon: Wallet, permission: "nomina" },
  { href: "/recetas", label: "Recetas", icon: ChefHat, permission: "recetas" },
  { href: "/produccion", label: "Producción", icon: Factory, permission: "produccion" },
  { href: "/remesas", label: "Remesas", icon: Send, permission: "remesas" },
  { href: "/contabilidad", label: "Contabilidad", icon: Calculator, permission: "contabilidad" },
  { href: "/asistente", label: "Asistente IA", icon: Sparkles, permission: "asistente" },
  { href: "/usuarios", label: "Usuarios", icon: Users, permission: "usuarios" },
];

export function SidebarNav({
  user,
  signOutAction,
  onNavigate,
}: {
  user: { fullName: string; email: string; roles: string[] };
  signOutAction: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter((it) => !it.permission || roleListHasPermission(user.roles, it.permission));
  return (
    <aside className="w-64 h-full border-r bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-5 py-4 border-b shrink-0">
        <div className="font-semibold text-base">Martínez Gestor</div>
        <div className="text-xs text-muted-foreground mt-0.5">ERP</div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            it.href === "/" ? pathname === "/" : pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.href}
              href={it.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t shrink-0">
        <div className="px-3 py-2 text-xs">
          <div className="font-medium text-foreground truncate">{user.fullName || user.email}</div>
          <div className="text-muted-foreground truncate">{user.roles.join(", ") || "sin rol"}</div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
