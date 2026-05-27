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
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles?: string[] };

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/productos", label: "Productos", icon: Package, roles: ["admin", "almacenero"] },
  { href: "/inventario", label: "Inventario", icon: Boxes, roles: ["admin", "almacenero", "vendedor"] },
  { href: "/inventario/movimientos", label: "Movimientos", icon: ArrowLeftRight, roles: ["admin", "almacenero"] },
  { href: "/inventario/lotes", label: "Lotes y costos", icon: Layers, roles: ["admin", "almacenero", "contador"] },
  { href: "/almacenes", label: "Almacenes", icon: Warehouse, roles: ["admin", "almacenero"] },
  { href: "/proveedores", label: "Proveedores", icon: Truck, roles: ["admin", "almacenero", "contador"] },
  { href: "/compras", label: "Compras", icon: ShoppingCart, roles: ["admin", "almacenero", "contador"] },
  { href: "/ventas", label: "Ventas", icon: Receipt, roles: ["admin", "vendedor", "contador"] },
  { href: "/clientes", label: "Clientes", icon: UserRound, roles: ["admin", "vendedor", "contador"] },
  { href: "/empleados", label: "Empleados", icon: Briefcase, roles: ["admin", "rrhh"] },
  { href: "/asistencia", label: "Asistencia", icon: CalendarCheck, roles: ["admin", "rrhh"] },
  { href: "/nomina", label: "Nómina", icon: Wallet, roles: ["admin", "rrhh", "contador"] },
  { href: "/recetas", label: "Recetas", icon: ChefHat, roles: ["admin", "almacenero"] },
  { href: "/produccion", label: "Producción", icon: Factory, roles: ["admin", "almacenero"] },
  { href: "/remesas", label: "Remesas", icon: Send, roles: ["admin", "vendedor", "contador"] },
  { href: "/contabilidad", label: "Contabilidad", icon: Calculator, roles: ["admin", "contador"] },
  { href: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
];

export function Sidebar({
  user,
  signOutAction,
}: {
  user: { fullName: string; email: string; roles: string[] };
  signOutAction: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter((it) => !it.roles || it.roles.some((r) => user.roles.includes(r)));
  return (
    <aside className="w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="px-5 py-4 border-b">
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
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t">
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
