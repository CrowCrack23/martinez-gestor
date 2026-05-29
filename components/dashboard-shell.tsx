"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SidebarNav } from "./sidebar";
import { cn } from "@/lib/utils";

export function DashboardShell({
  user,
  signOutAction,
  children,
}: {
  user: { fullName: string; email: string; roles: string[] };
  signOutAction: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar el drawer al navegar (cambia la ruta).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Bloquear el scroll del body mientras el drawer está abierto en móvil.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh">
      {/* Barra superior — solo móvil */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 border-b bg-sidebar text-sidebar-foreground flex items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="p-2 -ml-2 rounded-md hover:bg-sidebar-accent/60"
        >
          <Menu className="size-5" />
        </button>
        <span className="font-semibold">Martínez Gestor</span>
      </header>

      {/* Overlay — solo móvil cuando el drawer está abierto */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar: drawer deslizable en móvil, fijo (sticky) en desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 h-dvh w-64 transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:z-auto lg:shrink-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarNav user={user} signOutAction={signOutAction} onNavigate={() => setOpen(false)} />
      </div>

      <main className="flex-1 min-w-0 bg-background pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 max-w-[1400px] mx-auto w-full min-w-0">{children}</div>
      </main>
    </div>
  );
}
