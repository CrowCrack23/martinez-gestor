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

## Roles disponibles

| Rol          | Acceso                                             |
| ------------ | -------------------------------------------------- |
| `admin`      | Total (incluye usuarios y borrado de almacenes)    |
| `almacenero` | Almacenes, inventario, movimientos                 |
| `vendedor`   | Solo lectura de inventario                         |
| `contador`   | (reservado para módulo de contabilidad)            |
| `rrhh`       | (reservado para módulo de RRHH)                    |

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

### Flujos automáticos

- **Compra recibida** → movimiento `entrada` automático en almacén destino.
- **Venta confirmada** → movimiento `salida` automático del almacén origen.
- **Producción** → `salida` de insumos + `entrada` del producto terminado en el mismo almacén.
- **Asistencia + nómina** → cálculo automático de bruto proporcional a días trabajados al crear el período.

### Pendientes / próximas iteraciones

- Integración automática **contabilidad ↔ compras/ventas/nómina/remesas** (hoy los asientos son manuales).
- Reportes: P&L, estado de resultados, top SKUs por revenue.
- POS optimizado con búsqueda por código de barras.
- Multimoneda formal (hoy todo CUP excepto remesas USD).
