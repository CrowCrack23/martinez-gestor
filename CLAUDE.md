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
   `mensajero` solo ve las remesas asignadas a él. **Solo** esos roles (+admin)
   ven remesas: `vendedor` y `contador` ya NO tienen el permiso.

Roles añadidos (migración 0054): **`centro`** (operador del centro: recetas,
producción, inventario, movimientos, lotes, contabilidad, cuadres — con
user_businesses=`centro` ve solo el centro) y **`gerente`** (admin de la mipyme:
toda la operación menos usuarios/remesas/asistente, con user_businesses=
`{mipyme,centro}`). El traspaso de capital al centro lo pueden hacer `admin` y
`gerente`. Para acotar un vendedor a su tienda, basta asignarle ese negocio en
`/usuarios` (el alcance ya filtra ventas/inventario/etc.).

## Moneda: USD como moneda funcional (rectora)

Lee `lib/currency.ts` y la migración `0040_usd_functional_schema.sql` antes de
tocar dinero. Reglas:

- **Cada transacción congela su monto USD** a la tasa del día en que ocurre
  (compras, ventas, asientos, lotes/FIFO llevan columnas USD duales). La ganancia
  real se mide en USD, no en el CUP que se devalúa.
- La **tasa USD→CUP se registra a mano cada día** en `/remesas/tasas`. Con más de
  `RATE_STALE_DAYS` (3) días de antigüedad las operaciones se **bloquean**: usa
  `assertFreshRate()` (TS) / `current_usd_rate_strict` (SQL).
- Precios de venta CUP: conversión exacta USD×tasa al peso entero (`priceCupFromUsd`). Precios
  por moneda en `product_prices` (CUP/USD/EUR); `products.price` sigue siendo el
  precio USD del catálogo online.
- **Precisión dual (migración 0045):** los **costos/precios UNITARIOS** se guardan
  con **6 decimales** (`numeric(18,6)`; helper `round6`, inputs `step="any"`,
  display `formatUnit`). Los **totales/COGS/asientos** siguen a **2 decimales**
  (son montos de dinero).
- **Cantidades con decimales (migración 0047):** las cantidades de inventario son
  `numeric(18,3)` (insumos a granel, producción, compras, ventas) — ya **no son
  enteras**. Inputs `step="any"`, display `formatQty`. La función `_stock_add` y el
  RPC `confirm_pos_order` se recrearon con `numeric` (antes `integer` truncaba).
- Sin tasa registrada → mostrar `—`, **nunca asumir tasa 1**.

### Caja por moneda y asientos automáticos

`lib/auto-accounting.ts` genera asientos (en borrador, idempotentes, best-effort)
y **enruta el efectivo por moneda**:

- Venta efectivo/mixto en **USD → Caja USD (1120)**; en CUP → Caja CUP (1110);
  transferencia/tarjeta → Banco (1130). `generateSaleEntry` recibe `currency`.
- Compra de contado según `purchase_orders.payment_currency` (USD→1120, CUP→1110);
  a crédito → CxP (2100). Inversión fija (`addFixedAsset`) y aportes de socios
  igual, por moneda.
- **Merma**: `generateMermaEntry` → Pérdida por merma (5320) / Inventario (1300),
  con el costo FIFO consumido; además entra restada en el **cuadre semanal**.
- El **capital** (`lib/capital.ts`) lee efectivo del libro dual y el inventario de
  la valuación FIFO (`stockValuation`), no del saldo contable de 1300.

> Modelo completo en `docs/guia-uso-cliente.md` (guía del dueño) y en la memoria
> persistente `money-model`.

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

Última migración: **0051**. Pendientes de aplicar **en orden** (tocan la BD
compartida con la APK — hacerlo en baja actividad): **0047** (cantidades a
`numeric(18,3)`, recrea `_stock_add` y `confirm_pos_order`), **0048** (cuenta
`5320 Pérdida por merma` + `purchase_orders.payment_currency`), **0049**
(`operation_date` en compras/ventas/movimientos/remesas + `usd_rate_on(day)`;
"todo por fechas"), **0050** (red de seguridad del plan de cuentas — garantiza
que existan todas las cuentas que usa el código; resuelve "Faltan cuentas …") y
**0051** (negocio `centro` + cuenta `1600 Inversión en centro`; Fase 1 del
"centro de elaboración como negocio dentro del negocio") y **0052** (cuenta
`4400 Ventas de producción` + `operation_date` en `production_orders`; Fase 2:
producción con precio de transferencia), **0053** (tabla `centro_closures`;
Fase 3: cuadres propios del centro), **0054** (roles `centro` y `gerente`) y
**0055** (`freight_usd` en compras/movimientos: gasto de transportación que se
capitaliza al costo), **0056** (arregla `_stock_add`: rechaza dejar stock
negativo, incluido transferir un producto que no existe en el origen) y **0057**
(`products.is_insumo`: clasifica insumo vs producto terminado).

### Centro de elaboración = negocio (Fases 1-3)

El centro es el negocio `centro` (migración 0051; almacenes `centro_elaboracion`
cuelgan de él). `transferCapitalToCentro` (capital.ts) lo funda con capital de la
mipyme. En `produceOrder` (production.ts), si el almacén de la orden es del centro,
y el producto es **terminado** (`products.is_insumo=false`), el terminado pasa al
**almacén central** a precio de transferencia **T = costo + 33%·utilidad**
(utilidad = `products.price` USD − costo); si el producto es **insumo**
(`is_insumo=true`) se queda en el almacén del centro a costo (sin margen, sin
handoff). `generateCentroHandoffEntries`
(auto-accounting.ts) genera los asientos: el centro vende (Caja/Ventas producción
4400 + Costo/Inventario) y la mipyme compra (Inventario/Caja). Fase 3: el centro
tiene cuadres propios (`/cuadres/centro`, lib `centro-closures.ts`, tabla
`centro_closures`) basados en sus entregas de producción; al confirmar el cuadre
diario paga el 33% de su ganancia a los obreros (asiento 5250/Caja en business
centro). `CENTRO_WORKER_PCT=33`.

### Operaciones por fecha (migración 0049)

Cada compra/venta/movimiento/remesa lleva `operation_date` (elegible en el form).
Congela la **tasa vigente en esa fecha** (`getRateForDate`/`assertRateForDate`, la
más reciente con day ≤ fecha — sin la regla de frescura de 3 días). La fecha rige
la tasa, el `entry_date` del asiento y el **cuadre** (closures.ts agrupa por
`operation_date`). La APK (`confirm_pos_order`) sigue en tiempo real (toma el
default `current_date`).
