# Handoff — Martínez Gestor (ERP)

Documento para que otro agente retome el trabajo sin contexto previo. Fecha de corte: **2026-05-27**.

---

## 1. Qué es esto

ERP en `D:\Work\Selfish\martinez-gestor` para una empresa cubana del cliente Martínez (tienda online, tiendas físicas, centros de elaboración, remesas). Comparte base de datos Supabase con `D:\Work\Selfish\martinez-global` (la tienda online pública, que ya tenía su propio admin pequeño).

**Decisiones tomadas:**
- Single-tenant (una sola empresa, no SaaS).
- Solo online (sin offline-first por ahora).
- Convive con `/admin` de martinez-global (no lo reemplaza).
- Auth multiusuario con roles (no Supabase Auth — cookie HMAC + scrypt propio).
- Stack: **Next.js 16** + React 19 + Tailwind v4 + shadcn-style escrito a mano + `@supabase/supabase-js` con service_role.

---

## 2. Estado actual

### ✅ Hecho (compila limpio, `pnpm exec tsc --noEmit` pasa)

**7 migraciones SQL idempotentes** en `supabase/migrations/0005..0011`:

| # | Archivo | Crea |
|---|---------|------|
| 0005 | `0005_erp_inventory.sql` | `app_users`, `roles`, `user_roles`, `warehouses`, `stock_locations`, `inventory_movements`, `inventory_movement_lines` + trigger que aplica movimientos al stock |
| 0006 | `0006_purchases.sql` | `suppliers`, `purchase_orders`, `purchase_order_lines` |
| 0007 | `0007_sales.sql` | `customers`, `orders`, `order_lines` |
| 0008 | `0008_hr.sql` | `positions`, `employees`, `attendance`, `payroll_runs`, `payroll_items` |
| 0009 | `0009_production.sql` | `bills_of_materials`, `bom_components`, `production_orders` |
| 0010 | `0010_remittances.sql` | `exchange_rates`, `remittance_operations` |
| 0011 | `0011_accounting.sql` | `accounts` (con plan seedeado), `journal_entries`, `journal_lines` |
| 0012 | `0012_inventory_costing.sql` | `inventory_lots`, `inventory_lot_consumptions` + lotes de apertura a costo 0. **PENDIENTE DE APLICAR en Supabase.** |
| 0013 | `0013_online_orders.sql` | columnas de pago en `orders` + tabla `online_payments` (pasarela). **PENDIENTE DE APLICAR.** Habilita el pago con tarjeta de la tienda `martinez-global`. |
| 0014 | `0014_products_online_flag.sql` | columna `online_visible` en `products`. **PENDIENTE DE APLICAR — antes de correr la tienda**, o `listOnlineProducts` falla. Habilita el CRUD de productos del ERP (`/productos`) y el toggle "se vende online". |

**Numeración continúa desde martinez-global** (0001..0004 son de allí).

**Rutas del dashboard** (todas bajo `app/(dashboard)/`, route group `(dashboard)` no aparece en URL):

| Ruta | Rol(es) | Función |
|------|---------|---------|
| `/login` | público | Login email/password |
| `/` | cualquier autenticado | KPIs (stock total, low-stock, últimos movimientos) |
| `/usuarios` `/usuarios/nuevo` `/usuarios/[id]` | admin | CRUD usuarios + roles |
| `/almacenes` `/almacenes/nuevo` `/almacenes/[id]` | admin, almacenero | CRUD almacenes |
| `/inventario` | admin, almacenero, vendedor | Tabla stock con filtros + alerta low-stock |
| `/inventario/movimientos` `/inventario/movimientos/nuevo` | admin, almacenero | Historial + registrar movimientos |
| `/productos` `/productos/nuevo` `/productos/[id]` | admin, almacenero | CRUD del catálogo (tabla compartida `products`) + flag "se vende online" + tienda. El stock va por Inventario. |
| `/proveedores` `/proveedores/nuevo` `/proveedores/[id]` | admin, almacenero, contador | CRUD proveedores |
| `/compras` `/compras/nueva` `/compras/[id]` | admin, almacenero, contador | OC con borrador→recibida (genera entrada) |
| `/clientes` `/clientes/nuevo` `/clientes/[id]` | admin, vendedor, contador | CRUD clientes |
| `/ventas` `/ventas/nueva` `/ventas/[id]` | admin, vendedor, contador | OV con borrador→confirmada (genera salida) |
| `/empleados` `/empleados/nuevo` `/empleados/[id]` `/empleados/posiciones` | admin, rrhh | CRUD empleados + posiciones |
| `/asistencia` | admin, rrhh | Marcar presencia/horas por día |
| `/nomina` `/nomina/nuevo` `/nomina/[id]` | admin, rrhh, contador | Períodos de nómina con cálculo proporcional |
| `/recetas` `/recetas/nueva` `/recetas/[id]` | admin, almacenero | BOM (recetas con insumos por unidad) |
| `/produccion` `/produccion/nueva` `/produccion/[id]` | admin, almacenero | Órdenes de producción que consumen insumos y producen terminado |
| `/remesas` `/remesas/nueva` `/remesas/[id]` `/remesas/tasas` | admin, vendedor, contador | Remesas USD→CUP + tasas de cambio |
| `/contabilidad` `/contabilidad/cuentas` `/contabilidad/asientos` `/contabilidad/asientos/nuevo` `/contabilidad/asientos/[id]` `/contabilidad/balance` | admin, contador | Plan de cuentas, asientos doble entrada, balance de comprobación |

**Flujos automáticos cableados:**
- Compra recibida → `inventory_movements` tipo `entrada` con las líneas y costos.
- Venta confirmada → `inventory_movements` tipo `salida` desde el almacén origen.
- Producción → `salida` de insumos (calculada con `quantity_per_unit * builds`) + `entrada` del producto terminado (`yield * builds`).
- Nómina al crearse → suma días con `present=true` de `attendance` en el rango y prorratea el `monthly_salary`.

**Costeo por lotes (FIFO) — `lib/costing.ts`:**
- Centralizado en `createMovement` (único choke point de stock): toda `entrada` crea un lote con su costo; toda `salida`/`merma` consume lotes del más antiguo al más nuevo (`inventory_lot_consumptions`) y registra el costo real. `transferencia` mueve el costo entre almacenes; `ajuste` positivo crea lote / negativo consume.
- Producción: el costo del terminado = costo real de insumos consumidos / unidades producidas.
- Invariante: suma de `qty_remaining` de lotes = `quantity` de `stock_locations`. **No es transaccional** (supabase-js no expone transacciones); aceptable para single-tenant baja concurrencia.
- UI: `/inventario` muestra costo promedio y valor; `/inventario/lotes` lista lotes y permite ajustar el costo de lotes de **apertura** (los que entraron a costo 0) mientras no hayan tenido salidas.

**Contabilidad automática — `lib/auto-accounting.ts`** (asientos en **borrador**, idempotentes por `reference_type`+`reference_id`, best-effort: un fallo loguea pero no revierte la operación):
- Compra recibida → Inventario (debe) / Cuentas por pagar (haber).
- Venta confirmada → Caja|Banco|CxC / Ventas + (si COGS>0) Costo de ventas / Inventario. El COGS sale del consumo FIFO de lotes.
- Nómina cerrada → Salarios (bruto) / Salarios por pagar (neto) + Impuestos por pagar (deducciones).
- Remesa entregada → Caja CUP / Comisiones remesas, solo la comisión convertida a CUP (el principal USD↔CUP es pase neto).

**Inmutabilidad post-confirmación:** triggers `guard_*_immutable` en BD impiden modificar líneas de OC recibida, orden confirmada, asiento contabilizado y nómina cerrada.

### 🚧 Git

```
Branch: main
Remote: origin = https://github.com/CrowCrack23/martinez-gestor.git
HEAD:   8b831b8 feat: ERP completo (auth, inventario, compras, ventas, RRHH, produccion, remesas, contabilidad)
```

El commit está hecho **localmente**. `git push -u origin main` falló con HTTP 403 porque git está autenticado en Windows como `c1440768-hub` pero el repo es de `CrowCrack23`. **Pendiente:** el usuario tiene que resolver credenciales antes del push (ver §5).

### ❌ No hecho aún

1. ~~**Integración automática contabilidad ↔ otros módulos.**~~ **HECHO** (2026-05-27, migración 0012 + `lib/auto-accounting.ts` + costeo por lotes). Pendiente: aplicar migración 0012 en Supabase y ajustar el costo de los lotes de apertura en `/inventario/lotes`.
2. **Reportes de gestión.** No hay P&L, estado de resultados, top SKUs por revenue, rotación de inventario, márgenes.

**Pago online con tarjeta (PagueloFácil)** — **HECHO** (2026-05-27). La integración vive en el repo `martinez-global` (la tienda), que escribe en las tablas compartidas del ERP. Migración `0013_online_orders.sql` (en este repo). El pedido online pagado entra como **borrador con `payment_status='pagado'`** y se ve en `/ventas` con badge "Pagado online"; al confirmarlo aquí se dispara stock/COGS/contabilidad. Ver detalles en `martinez-global/CLAUDE.md` sección Payments. Requiere `PAGUELOFACIL_CCLW` en el `.env.local` de la tienda para el cobro real (sin él solo funciona WhatsApp).
3. **POS optimizado.** `/ventas/nueva` funciona pero no es POS real: sin búsqueda por barcode, sin atajos de teclado, sin pantalla de caja diferenciada.
4. **Multimoneda formal.** Casi todo asume CUP. Remesas manejan USD pero el resto del sistema no tiene noción de moneda — los precios de productos son números planos.
5. **Auditoría / historial de cambios.** No hay tracking de quién editó qué (solo `created_by`/`posted_by`/etc. en headers).
6. **Validaciones de stock al confirmar venta.** Hoy la BD permite stock negativo solo si el trigger lo detecta — la UI no avisa antes de confirmar si va a fallar.
7. **Cuestión abierta del seed de warehouses.** La migración 0005 auto-creó un `warehouse` `tienda_online` por cada `store` de martinez-global (motos/comida/intimo/ropa). El usuario lo señaló como confuso ("pusiste las tiendas como almacenes") pero la conversación se interrumpió antes de decidir si fusionar en un único almacén central, renombrar, o eliminarlos. **Preguntar al usuario antes de tocar.**

---

## 3. Cómo retomarlo (otro agente)

### Setup local (si vienes en frío)

1. Lee `CLAUDE.md` → te lleva a `AGENTS.md` que recuerda: **este Next.js 16 tiene breaking changes**, lee `node_modules/next/dist/docs/` antes de tocar APIs.
2. `pnpm install` en `D:\Work\Selfish\martinez-gestor`.
3. Asegúrate de que existe `.env.local` con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (mismo proyecto que martinez-global) y `SESSION_SECRET` (≥32 chars).
4. Aplica las migraciones 0005..0011 en el SQL Editor de Supabase en orden si aún no están.
5. Crea un admin si no existe:
   ```powershell
   $env:SUPABASE_URL = "..."
   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
   node scripts/hash-password.mjs --create <email> <password> "<nombre>" admin
   ```
6. `pnpm dev` → `http://localhost:3000`. Login con el usuario creado.

El admin de pruebas existente (en BD del cliente) es `osmeldev@gmail.com` / `Zaqwsx-1234` (rol admin). **No es un usuario real**, solo para dev.

### Antes de escribir cualquier código nuevo

Lee `lib/auth.ts`, `lib/inventory.ts`, `lib/purchases.ts` y una página existente como `app/(dashboard)/compras/[id]/page.tsx`. Los patrones del proyecto están en la memoria persistente (`~/.claude/projects/D--Work-Selfish-martinez-gestor/memory/`) — consúltala. Los más importantes:

- **`revalidateTag(tag, "max")` con segundo argumento obligatorio** (Next 16). Sin él, typecheck falla.
- **`cookies()`, `headers()`, `params`, `searchParams` son async** en Next 16.
- **`proxy.ts`** (no `middleware.ts`), export `proxy`.
- **Joins de Supabase no se infieren** — cast a tipo local con `as unknown as RawRow[]`.
- **Patrón redirect en server actions:** parsear → llamar lib → en error `redirect("...?error=...")`, en éxito `redirect("...?success=...")`. Hay que reenviar `NEXT_REDIRECT` con `if (e instanceof Error && e.message.startsWith("NEXT_REDIRECT")) throw e;` cuando se usan `redirect()` dentro y fuera de try/catch en el mismo handler.
- **Migraciones idempotentes** (`do $$ ... exception when duplicate_object ...`, `insert ... on conflict do nothing`). Numeradas continuando la secuencia global.
- **Inmutabilidad:** documentos en estado terminal (recibida/confirmada/contabilizada/cerrada) no permiten editar líneas — un trigger guard lo refuerza en BD.

### Próximas tareas (orden sugerido)

1. **Resolver push pendiente** (§5).
2. **Decidir limpieza de warehouses auto-seedeados** (preguntar antes de hacer cambios — el usuario lo notó pero no decidió). Hay 4 warehouses tipo `tienda_online` creados en 0005 que pueden no reflejar la operación real.
3. **Integración compras→contabilidad** como primer caso de uso: cuando `receivePurchaseOrder` complete, generar un `journal_entries` borrador con líneas `Inventario (debe) / Cuentas por pagar (haber)`. Probablemente exponer una opción "contabilizar al recibir" configurable.
4. **Validar stock disponible antes de confirmar venta.** Hoy el trigger en BD impide stock negativo, pero la UI no avisa. Agregar consulta de stock por línea en `confirmOrder` y rechazar con mensaje claro si falta.
5. **POS:** crear `/pos` separado de `/ventas/nueva` con UI minimalista para tablet (búsqueda rápida por nombre, autocompletado, sumar al ticket, cobrar de un toque).
6. **Reportes:** `/reportes/ventas-por-tienda`, `/reportes/pl`, `/reportes/top-productos`.

### Cómo validar cambios

Después de cambios en `lib/` o `app/`, siempre correr:
```powershell
pnpm exec tsc --noEmit
```
Debe pasar **sin output**. Si falla, lo más común es:
- `revalidateTag(tag)` sin el segundo argumento.
- Tipo `never` por join no inferido — usar el cast `as unknown as RawRow[]`.
- `params`/`searchParams` no awaited.

Para probar UI: `pnpm dev`, abrir el navegador, hacer un flujo punta a punta (crear proveedor → OC borrador → recibir → confirmar que stock subió en `/inventario`). El servidor responde `/` con 307 → `/login` cuando no hay sesión válida.

---

## 4. Mapa de archivos relevantes

```
app/
  layout.tsx                         # root html/body + sonner Toaster
  login/page.tsx                     # login form
  (dashboard)/
    layout.tsx                       # sidebar + requireUser gate
    page.tsx                         # KPIs
    {modulo}/
      page.tsx                       # listado
      nueva/page.tsx | nuevo/        # crear
      [id]/page.tsx                  # ver/editar/transicionar estado
      actions.ts                     # "use server" — uno por módulo

lib/
  supabase.ts, supabase-types.ts     # cliente + tipos manuales
  auth.ts, session.ts                # cookie HMAC + scrypt + requireUser/Role
  validation.ts, format.ts, utils.ts # helpers
  warehouses.ts, inventory.ts        # módulo 1
  suppliers.ts, purchases.ts         # módulo 2
  customers.ts, sales.ts             # módulo 3
  hr.ts                              # módulo 4 (empleados+asistencia+nómina)
  production.ts                      # módulo 5 (BOM+órdenes)
  remittances.ts                     # módulo 6
  accounting.ts                      # módulo 7
  users.ts                           # CRUD app_users
  products-lite.ts, stores-lite.ts   # readonly de tablas de martinez-global

components/
  sidebar.tsx                        # navegación con filtro por rol
  flash.tsx                          # banners success/error desde searchParams
  ui/                                # button, card, input, label, select, textarea
  movement-form.tsx                  # cliente: inventory movement
  purchase-line-editor.tsx           # cliente: líneas de OC
  order-line-editor.tsx              # cliente: líneas de OV con auto-precio
  bom-components-editor.tsx          # cliente: insumos de receta
  journal-line-editor.tsx            # cliente: líneas de asiento (debe/haber)

proxy.ts                             # gate de auth (excepto /login)
next.config.ts                       # security headers + remotePatterns Supabase
scripts/hash-password.mjs            # generar hashes, secret, o --create usuario
supabase/migrations/0005..0011.sql   # 7 archivos idempotentes
```

---

## 5. Push pendiente

El último intento de push falló:
```
remote: Permission to CrowCrack23/martinez-gestor.git denied to c1440768-hub.
fatal: unable to access 'https://github.com/CrowCrack23/martinez-gestor.git/': The requested URL returned error: 403
```

Git en Windows está autenticado como `c1440768-hub` pero el remoto `origin` apunta al repo de `CrowCrack23`. El **commit ya existe localmente** (`8b831b8`). Opciones que se propusieron al usuario:

1. Borrar credenciales en Windows Credential Manager (`git:https://github.com`) y reintentar — pedirá login y se puede usar el token correcto.
2. `gh repo create <user>/martinez-gestor --source=. --remote=origin --push`.
3. `git remote set-url origin https://github.com/<tu-user>/martinez-gestor.git && git push -u origin main`.

El usuario no había decidido cuál cuando se pidió este handoff. **Antes de hacer push, confirma con él qué cuenta y repo destino.**

---

## 6. Memoria persistente

Hay tres archivos en `~/.claude/projects/D--Work-Selfish-martinez-gestor/memory/`:

- `project_martinez_gestor.md` — estructura general, migraciones, relación con martinez-global.
- `project_conventions.md` — patrones obligatorios (revalidateTag, joins, redirects, etc.).
- `project_test_admin.md` — usuario admin de pruebas y cómo recrearlo si falta.

Léelos al arrancar.
