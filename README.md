# Martínez Gestor — ERP

Panel de administración (Next.js 16) para la operación de Martínez. Comparte la
base de datos Supabase con `martinez-global` (tienda online); este repo
gestiona el ERP: usuarios, almacenes, inventario, movimientos. Próximos
módulos: compras, ventas, RRHH, producción, remesas y contabilidad.

## Setup inicial

### 1. Aplicar las migraciones SQL

Abre **Supabase → SQL Editor** y aplica **en orden** todas las migraciones del
módulo. Son idempotentes (puedes correrlas varias veces sin daño):

```
supabase/migrations/0005_erp_inventory.sql   # Auth + almacenes + inventario
supabase/migrations/0006_purchases.sql       # Proveedores + compras
supabase/migrations/0007_sales.sql           # Clientes + ventas (POS + online)
supabase/migrations/0008_hr.sql              # RRHH (empleados + asistencia + nómina)
supabase/migrations/0009_production.sql      # Recetas + producción
supabase/migrations/0010_remittances.sql     # Remesas + tasas de cambio
supabase/migrations/0011_accounting.sql      # Plan de cuentas + asientos
```

La 0005 crea estas tablas:

- `app_users`, `roles`, `user_roles` — auth multiusuario con roles
- `warehouses` — almacenes (central, tienda física/online, centro de elaboración)
- `stock_locations` — stock por producto × almacén
- `inventory_movements` + `inventory_movement_lines` — historial con trigger
  que aplica el delta sobre `stock_locations` automáticamente.

El script crea un warehouse `tienda_online` por cada `store` existente y migra
`products.stock` ahí.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...      # mismo proyecto que martinez-global
SESSION_SECRET=...                  # >=32 chars
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Genera un `SESSION_SECRET`:

```bash
node scripts/hash-password.mjs --secret
```

### 3. Crear el primer admin

Con `.env.local` cargado en el shell (o usa `dotenv -e .env.local --`):

```bash
node scripts/hash-password.mjs --create admin@martinez.com TuPassword123 "Tu Nombre" admin
```

Eso inserta el usuario en `app_users` y le asigna el rol `admin`.

### 4. Levantar el dev server

```bash
pnpm install
pnpm dev
```

Entra a `http://localhost:3000` → te redirige a `/login`.

## Acceso: roles + negocios

Dos dimensiones independientes (ver `lib/permissions.ts` y `lib/auth.ts`):

1. **Rol → permisos por módulo** (matriz única en `lib/permissions.ts`; `admin = "*"`):

| Rol          | Módulos                                                              |
| ------------ | ------------------------------------------------------------------- |
| `admin`      | Todo (+ usuarios, asistente IA, borrados)                           |
| `almacenero` | Productos, inventario, movimientos, lotes, almacenes, proveedores, compras, recetas, producción |
| `vendedor`   | Inventario, ventas, clientes, remesas                              |
| `contador`   | Lotes, proveedores, compras, ventas, clientes, nómina, remesas, contabilidad |
| `rrhh`       | Empleados, asistencia, nómina                                       |
| `mensajero`  | Remesas — **solo las asignadas a él** (entregar / marcar no entregada; sin ver comisión) |

2. **Negocio (tienda)** — `user_businesses` asigna tiendas a cada usuario; sus datos de
   ventas/inventario/compras/contabilidad se filtran a ellas. `admin` ve todos. Se asigna en
   `/usuarios`.

### Contabilidad por negocio (libros separados)

La contabilidad usa **un plan de cuentas compartido + una dimensión "negocio"** en cada
asiento (`journal_entries.business`). Un "negocio" es una tienda **o** `remesas` (negocio
aparte, sin tienda ni stock); el catálogo está en la tabla `businesses` (ver migración 0018,
`lib/businesses.ts`). Cada negocio tiene:

- **Numeración propia** con prefijo (`ROPA-2026-00001`, `REM-2026-00001`), vía trigger
  `set_journal_entry_code` + tabla `journal_entry_counters`.
- **Reportes filtrables por negocio o consolidados** (suma de todos): Asientos, Balance y
  **Estado de resultados** (`/contabilidad/resultados`) tienen un selector de negocio
  (`components/business-filter.tsx`). El admin ve todos; los demás solo sus negocios.

Imputación automática del negocio: **ventas/compras** → tienda del almacén; **nómina** →
negocio del empleado (`employees.business`, un asiento por negocio al cerrar); **remesas** →
negocio `remesas`.

### Remesas: mensajeros (rol `mensajero`)

Cada remesa se puede asignar a un **mensajero** (`remittance_operations.assigned_to`, ver
migración 0019) — quien lleva el dinero al beneficiario. Se asigna al crear la remesa y es
editable después (por admin/vendedor). El mensajero entra a `/remesas` y ve **solo las remesas
asignadas a él** (filtrado por `remittanceAssignee(user)` en `lib/auth.ts`), sin la comisión,
y puede marcarlas **entregada** o **no entregada**; no crea ni edita. Los roles
admin/vendedor/contador siguen viendo todas.

Para cambiar qué módulos ve un rol, edita SOLO `ROLE_PERMISSIONS` en `lib/permissions.ts`.

## Estructura

```
app/
  login/                         # auth (público)
  (dashboard)/                   # protegido por proxy.ts + requireUser
    page.tsx                     # / -- KPIs
    usuarios/                    # solo admin
    almacenes/
    inventario/
      page.tsx                   # tabla de stock con filtros
      movimientos/
        page.tsx                 # historial
        nuevo/                   # registrar movimiento
components/
  ui/                            # primitivas shadcn (button, input, card, ...)
  sidebar.tsx
  flash.tsx
lib/
  supabase.ts, supabase-types.ts
  auth.ts, session.ts            # cookie HMAC + scrypt
  warehouses.ts, inventory.ts, users.ts
  validation.ts, format.ts, utils.ts
supabase/migrations/
  0005_erp_inventory.sql         # numeración continúa después de
                                 # martinez-global/0001..0004
scripts/
  hash-password.mjs              # generar hash, secret, o crear usuarios
proxy.ts                         # gate de auth (todas las rutas excepto /login)
```

## Patrones (heredados de martinez-global)

- **Server-only DB:** `lib/supabase.ts` usa la `SERVICE_ROLE_KEY`. RLS está
  habilitado pero sin policies (defense in depth).
- **Cache:** lecturas envueltas en `unstable_cache` con tags. Mutaciones
  llaman `revalidateTag(tag, "max")` (Next 16 exige el segundo arg).
- **Server actions:** una por módulo en `app/(dashboard)/<modulo>/actions.ts`.
  Validación con `ValidationError`; en error `redirect("...?error=...")`,
  en éxito `redirect("...?success=...")`.
- **Auth:** `proxy.ts` valida la cookie HMAC en cada request; `requireUser()`
  y `requireRole([...])` se llaman desde layouts/pages para gating.

## Módulos implementados

| Módulo | Rutas | Migración |
| ------ | ----- | --------- |
| Auth + roles + dashboard | `/login`, `/`, `/usuarios` | 0005 |
| Inventario | `/almacenes`, `/inventario`, `/inventario/movimientos` | 0005 |
| Compras | `/proveedores`, `/compras` | 0006 |
| Ventas | `/clientes`, `/ventas` (POS + online + WhatsApp) | 0007 |
| RRHH | `/empleados`, `/empleados/posiciones`, `/asistencia`, `/nomina` | 0008 |
| Producción | `/recetas` (BOM), `/produccion` | 0009 |
| Remesas | `/remesas`, `/remesas/tasas` | 0010 |
| Contabilidad | `/contabilidad/cuentas`, `/contabilidad/asientos`, `/contabilidad/balance` | 0011 |
| Productos (catálogo) | `/productos` | 0014 |
| Costeo FIFO / lotes | `/inventario/lotes` | 0012 |
| Asistente IA (solo admin) | `/asistente` | — (Mastra) |

### Flujos automáticos

- **Compra recibida** → movimiento `entrada` + asiento contable borrador (Inventario / CxP).
- **Venta confirmada** → movimiento `salida` + asiento (Caja|CxC / Ventas + COGS).
- **Producción** → `salida` de insumos + `entrada` del producto terminado en el mismo almacén.
- **Asistencia + nómina** → bruto proporcional a días trabajados al crear el período; al cerrar genera asiento.
- **Costeo FIFO** centralizado en `createMovement`: cada salida consume lotes y registra COGS real.

### Asistente IA (Mastra, solo admin, solo lectura)

Chat en `/asistente` que consulta los datos reales del ERP vía 22 tools (ventas, cuadres,
inventario, compras, contabilidad y P&L, capital, remesas y su dinero, socios, tasa del día,
RRHH, producción…) + guía de navegación. Multi-proveedor:
**OpenAI / Anthropic / Google** (se elige en la UI). Configura al menos una API key en
`.env.local` (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY`).
⚠️ OpenAI y Google bloquean IPs cubanas — el servidor debe estar fuera de Cuba.

### Pendientes / próximas iteraciones

- **Fase 2 del asistente:** tools de escritura con confirmación humana (crear borradores, recibir/confirmar).
- Reportes: P&L, ventas por negocio, top SKUs, rotación, márgenes.
- POS optimizado con búsqueda por código de barras.
- Multimoneda formal (hoy todo CUP excepto remesas USD).
