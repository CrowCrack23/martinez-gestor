# Auditoría de reversibilidad — ERP Martínez

Motivo: el cliente reporta que hay operaciones que **no puede revertir** (ej.:
agregó un socio a un negocio y no pudo eliminarlo). Esta es la revisión de los
25 módulos: qué se puede deshacer, qué no, y qué es un hueco real vs. una
restricción contable correcta.

## A) Bien resueltos (se pueden revertir)

| Módulo | Cómo se revierte |
| --- | --- |
| Almacenes, Clientes, Proveedores, Productos | Editar / **Eliminar** (valida referencias) |
| Compras | Editar, Cancelar, Eliminar **solo en borrador** — ver corrección #9 |
| Ventas | Editar, Cancelar, Eliminar **solo en borrador** — ver corrección #10 |
| Producción | **Cancelar**, **Eliminar** |
| Nómina | Editar líneas, **Eliminar** período |
| Empleados / Posiciones | Editar / **Eliminar** |
| Recetas (BOM) | Editar / **Eliminar** |
| Remesas | Editar, **Cancelar**, **Eliminar** + borrar tasa |
| Usuarios | Editar / **Eliminar** |
| Contabilidad (cuentas) | Editar / **Eliminar** |
| Puntos de venta | **Desactivar** personal |

## B) Irreversibles por diseño correcto (libros contables)

No deben tener "borrar fila"; se revierten con asiento/movimiento inverso:

- **Asientos contables** — `deleteJournalEntry` existe, pero un asiento ya
  *contabilizado* no se borra (`status === "contabilizada"` lo bloquea). Correcto.
- **Movimientos de inventario** (`createMovementAction`) — historial de stock +
  FIFO. Se corrige con un movimiento de ajuste inverso. Correcto. *(Mejora
  futura: botón de "ajuste inverso" guiado.)*
- **Asistencia** (`saveAttendanceAction`) — es un *upsert*; se sobreescribe.
  Correcto.

## C) Huecos reales — falta poder revertir

| # | Módulo | Acción sin reverso | Notas de implementación |
| --- | --- | --- | --- |
| 1 | **Socios** | `createPartner` → solo Desactivar | ⬅️ lo reportado. FK: `capital_contributions` y `profit_distribution_lines` (`on delete restrict`). Borrar solo si no tiene aportes ni repartos. |
| 2 | **Socios** | `addContribution` (aporte de capital) | Genera asiento (`journal_entry_id`). Borrar fila + asiento borrador. |
| 3 | **Capital** | `addFixedAsset` (activo fijo) | Genera asiento (`journal_entry_id`, FK `on delete set null`). |
| 4 | **Capital** | `recordCashMovement` (ingreso/gasto) | ⚠️ NO guarda el `journal_entry_id` (usa `reference_id` random). Hay que poder ubicar el asiento por `reference_type='mov_caja'` + `reference_id` para reversarlo. |
| 5 | **Remesas → Dinero** | `addMovement` (movimiento de tenedor) | `money_movements.remittance_id`: si no es null, es automático de una remesa → no borrar manualmente. Falta UI que liste los movimientos. |
| 6 | **Cuadres** (diario) | `confirmDailyClosure` | No hay reabrir. |
| 7 | **Remesas → Cuadre** | `confirmRemittanceClosure` | No hay reabrir. |
| 8 | **Socios → Reparto** | `confirmDistribution` + `markPartnerPaid` | No hay deshacer; puede generar asientos/pagos. |
| 9 | **Compras** | una orden **recibida** no se puede borrar ni cancelar | ⚠️ corrección: la auditoría inicial la dio por resuelta. Recibir genera movimiento de entrada + lotes FIFO + asiento; nada se revertía. |
| 10 | **Ventas** | una orden **confirmada** no se puede borrar ni cancelar | Mismo caso espejo: confirmar genera salida + consumo FIFO + asiento. |

### Corrección importante a la auditoría

La clasificación inicial de Compras y Ventas como "bien resueltas" estaba **mal**:
solo eran reversibles en *borrador*. Una vez recibida/confirmada quedaban
atascadas. Esto es lo que reportó el cliente ("si me equivoco en una compra no la
puedo borrar"). Es el mismo patrón que los cierres (Fase 3): una operación que
generó efectos colaterales (stock, lotes, contabilidad) necesita una
**anulación** que los revierta antes de poder borrar.

## Plan por fases

**Fase 1 — borrados simples (en curso).** Resuelve la queja directa.
- #1 `deletePartner` (socios) — valida aportes/repartos.
- #3 `deleteFixedAsset` (capital) — borra activo + asiento borrador.
- #5 `deleteMovement` (remesas/dinero) — bloquea si `remittance_id`; añade lista
  de movimientos recientes en la UI.

**Fase 2 — borrados con reverso contable. ✅ Hecho.**
- #2 aporte de capital: `deleteContribution` borra la fila + su asiento borrador
  (botón Eliminar en `/socios/aportes`).
- #4 ingreso/gasto de caja: no hay tabla propia, cada uno ES un asiento
  `reference_type='mov_caja'`. `listCashMovements` los lista en `/capital` y
  `deleteCashMovement` borra el asiento (descontabiliza si hace falta).

**Fase 3 — reapertura de cierres. ✅ Hecho.**

Reglas decididas por el cliente: **solo admin** puede reabrir, y al reabrir se
**anulan automáticamente** los asientos generados y se borran los pagos (queda
como antes del cierre). Si un asiento ya estaba *contabilizado*, se
**descontabiliza y se borra** igual (ver "Regla de asientos contabilizados").

- #6 `reopenDailyClosure` (`/cuadres`): anula la comisión (`reference_type='cuadre'`)
  y borra el snapshot. Los respaldos de venta (idempotentes, son de las ventas)
  NO se tocan y se regeneran al reconfirmar.
- #7 `reopenWeeklyClosure` (`/remesas/cuadre`): anula el pago a mensajeros
  (`cuadre_remesas`) y los repartos a socios (`reparto_remesas`); borra el cuadre
  (líneas en cascada).
- #8 `reopenDistribution` (`/socios/reparto`): anula los pagos a socios
  (`reparto`) y borra el reparto (líneas en cascada).

Helper común nuevo: `deleteEntriesByReference(type, id)` en `lib/accounting.ts`.

### Regla de asientos contabilizados (decisión del cliente)

Al **anular/reabrir una operación completa** (compra, venta, cierre, reparto,
aporte, activo fijo, ingreso/gasto), el asiento se **descontabiliza y se borra**
aunque estuviera contabilizado — el cliente necesita "darle para atrás" sin
trabarse. Esto lo hacen `forceDeleteJournalEntry` y `deleteEntriesByReference`.
El **borrado manual** de un asiento suelto en `/contabilidad` (`deleteJournalEntry`)
**sí** sigue bloqueando los contabilizados.

**Fase 4 — anular recepción/confirmación (corrección #9/#10).**
- #9 Compras: ✅ `undoReceivePurchaseOrder` (`/compras/[id]`). Solo admin. Revierte
  stock, borra lotes y asiento (descontabiliza si hace falta), devuelve a borrador.
  Solo bloquea si la mercancía ya se vendió/movió (lotes consumidos).
- #10 Ventas: ✅ `undoConfirmOrder` (`/ventas/[id]`). Solo admin. Devuelve los
  lotes consumidos (`inventory_lot_consumptions`), repone stock, borra asiento de
  venta y movimiento (descontabiliza si hace falta), y vuelve a borrador.

**Mejora aparte:** botón de "ajuste inverso" guiado en movimientos de inventario.
