@AGENTS.md

# Martínez Gestor — ERP

Panel ERP en **Next.js 16 + React 19** para la operación de Martínez (negocio en
Cuba). Comparte la base de datos **Supabase** con `martinez-global` (tienda
online). Cubre inventario, compras, ventas/POS, RRHH, producción, remesas,
contabilidad por negocio, capital/socios y un asistente IA. Idioma del producto
y del código de dominio: **español**.

Gestor de paquetes: **pnpm**. Scripts: `pnpm dev`, `pnpm build`, `pnpm start`,
`pnpm lint`. Lee primero el `README.md` (setup, migraciones, matriz de roles) y
`HANDOFF.md` (estado y decisiones) antes de cambios grandes.

## Esta NO es la Next.js que conoces

Versión con breaking changes (ver `AGENTS.md`). Antes de tocar APIs de Next, lee
la guía en `node_modules/next/dist/docs/`. Puntos ya confirmados en este repo:

- **El middleware se llama `proxy.ts`** (raíz), no `middleware.ts`. Exporta
  `proxy()` + `config.matcher`. Es el gate de auth de todas las rutas salvo
  `/login` y `api/`.
- `revalidateTag(tag, "max")` exige el **segundo argumento** en Next 16.
- `app/(dashboard)/` es un route group protegido; `app/login/` es público.

## Arquitectura

- **DB solo en servidor.** `lib/supabase.ts` usa `SERVICE_ROLE_KEY` (cliente
  singleton). Todos los módulos `lib/*.ts` empiezan con `import "server-only"`.
  RLS está habilitado; la APK móvil usa policies propias (auth Supabase), el
  gestor web pasa por el service role.
- **Una capa `lib/<dominio>.ts` por dominio** (lecturas + lógica) y **una
  `app/(dashboard)/<modulo>/actions.ts` por módulo** (server actions de
  mutación). Las páginas son Server Components que llaman a `lib/*`.
- **Cache:** lecturas en `unstable_cache` con tags; las mutaciones invalidan con
  `revalidateTag(tag, "max")`.
- **Server actions:** validan con `ValidationError` (`lib/validation.ts`); en
  error `redirect("...?error=...")`, en éxito `redirect("...?success=...")`. La
  UI muestra el flash con `components/flash.tsx`.
- **Auth:** cookie HMAC (`lib/session.ts`, scrypt + HMAC). `proxy.ts` valida la
  cookie en cada request; dentro de páginas/layouts se usa `requireUser()` /
  `requirePermission()` (`lib/auth.ts`). Crear usuarios y hashes:
  `scripts/hash-password.mjs`; usuarios móviles: `scripts/create-mobile-user.mjs`.

## Acceso: roles × negocios × membresías

Tres dimensiones, no las confundas:

1. **Rol → permisos por módulo.** Matriz única en `lib/permissions.ts`
   (`ROLE_PERMISSIONS`, `admin = "*"`). El sidebar y los guards leen de ahí — para
   cambiar qué ve un rol edita SOLO esa matriz, no las páginas. Restricciones
   finas de escritura (p.ej. "solo admin elimina") viven como checks de rol
   dentro de cada action.
2. **Negocio (tienda).** `user_businesses` asigna tiendas; ventas/inventario/
   compras/contabilidad se filtran a ellas. `admin` ve todo. Contabilidad usa un
   plan de cuentas compartido + dimensión `business` por asiento, con numeración
   propia por negocio (`ROPA-2026-00001`, `REM-…`).
3. **Remesas por membresía.** Los roles `encargado_remesas / gestor / mensajero`
   se asignan **por negocio** en `business_members` (no como roles globales). El
   `mensajero` solo ve las remesas asignadas a él.

## Moneda: USD como moneda funcional (rectora)

Lee `lib/currency.ts` y la migración `0040_usd_functional_schema.sql` antes de
tocar dinero. Reglas:

- **Cada transacción congela su monto USD** a la tasa del día en que ocurre
  (compras, ventas, asientos, lotes/FIFO llevan columnas USD duales). La ganancia
  real se mide en USD, no en el CUP que se devalúa.
- La **tasa USD→CUP se registra a mano cada día** en `/remesas/tasas`. Con más de
  `RATE_STALE_DAYS` (3) días de antigüedad las operaciones se **bloquean**: usa
  `assertFreshRate()` (TS) / `current_usd_rate_strict` (SQL).
- Precios de venta CUP: múltiplo de 5 hacia arriba (`priceCupFromUsd`). Precios
  por moneda en `product_prices` (CUP/USD/EUR); `products.price` sigue siendo el
  precio USD del catálogo online.
- Sin tasa registrada → mostrar `—`, **nunca asumir tasa 1**.

## Asistente IA (Mastra, solo admin, solo lectura)

Chat en `/asistente` (`app/api/asistente/route.ts`). Agente en
`mastra/agents/erp-agent.ts`, tools en `mastra/tools/erp-tools.ts`. Multi-
proveedor OpenAI / Anthropic / Google (`lib/ai-providers.ts`); configura al menos
una API key en `.env.local`. Mastra va en `serverExternalPackages` (next.config).
⚠️ OpenAI y Google bloquean IPs cubanas — el servidor debe estar fuera de Cuba.

## Migraciones SQL

`supabase/migrations/00NN_*.sql`, **idempotentes**, se aplican en orden en el SQL
Editor de Supabase. Numeración continúa la de `martinez-global`. Al añadir
esquema, crea una migración nueva (no edites las viejas) y mantenla idempotente
(`create … if not exists`, `add column if not exists`, `drop policy if exists`).
