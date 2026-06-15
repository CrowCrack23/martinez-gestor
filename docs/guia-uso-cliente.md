# Guía de uso — ERP Martínez

Guía práctica para el dueño y los trabajadores. Explica **cómo trabajar el día a
día**, cómo se mueve el dinero y cómo leer la contabilidad sin ser contador.

> Regla de oro: **el dólar (USD) es la moneda rectora.** Cada operación guarda su
> valor en USD a la tasa del día. Por eso la ganancia real se mide en dólares,
> aunque el peso (CUP) suba o baje.

---

## 1. Lo primero cada día: la tasa del cambio

Antes de vender o comprar, hay que **registrar la tasa USD→CUP del día** en
**Remesas → Tasas** (`/remesas/tasas`).

- Si la tasa tiene **más de 3 días** sin actualizar, el sistema **bloquea** las
  ventas, compras e inversiones (para no congelar valores con una tasa vieja).
- Sin tasa registrada, los importes en dólares se muestran como “—”. **Nunca se
  asume tasa 1.**

👉 **Quien abra el negocio en la mañana registra la tasa del día. Es el paso 1.**

---

## 2. Dónde vive el dinero (las “cajas”)

El sistema lleva **dos cajas de efectivo + el banco**, cada una por separado:

| Caja | Qué es |
|------|--------|
| **Caja CUP** | Efectivo en pesos cubanos. |
| **Caja USD** | Efectivo en dólares. |
| **Banco** | Transferencias y tarjeta (en CUP). |

Todo esto se ve en **Capital** (`/capital`), junto con el valor del inventario,
lo que te deben (por cobrar), lo que debes (por pagar) y la infraestructura.

**Las cajas suben y bajan solas** con cada operación. No hay que cuadrarlas a
mano: el sistema mueve el dinero a la caja correcta según la **moneda** de cada
venta, compra o gasto.

- Vendes algo cobrado **en dólares** → sube la **Caja USD**.
- Vendes cobrado **en pesos** → sube la **Caja CUP**.
- Cobras por **transferencia/tarjeta** → sube el **Banco**.
- Compras o inviertes pagando **en dólares** → baja la **Caja USD**.
- Compras o inviertes pagando **en pesos** → baja la **Caja CUP**.

---

## 3. Vender (POS / Ventas)

En **Ventas** (`/ventas/nueva`):

1. Elige el punto de venta, el cliente (opcional) y agrega los productos.
2. **El precio NO se escribe**: se calcula solo desde el precio en USD del
   producto × la tasa del día (redondeado a 5 CUP hacia arriba). Por eso es
   importante que cada producto tenga su **precio en USD** puesto en
   **Productos**.
3. Elige la **moneda de cobro** (CUP o USD) y la **forma de pago** (efectivo,
   transferencia, tarjeta).
4. La venta nace en **borrador**. Al **confirmarla**:
   - Baja el stock del almacén.
   - Entra el dinero a la **caja que corresponde según la moneda**.
   - Se registra el **costo de lo vendido** y la **ganancia**.

> Las cantidades admiten **decimales** (ej.: 1.5 kg, 0.250). Útil para vender
> productos a granel.

---

## 4. El cuadre del punto de venta

En **Cuadres** (`/cuadres`):

- **Cuadre diario**: al final del día confirmas el cuadre. Congela el resumen del
  día (efectivo CUP, transferencia, USD), calcula la **ganancia** y el **pago al
  trabajador** (su % sobre la ganancia) y lo registra.
- **Cuadre semanal** (`/cuadres/semanal`): resumen de la semana con comparación
  contra la semana anterior, productos más/menos vendidos, el día que más vende y
  **la merma de la semana** (ver punto 6). La ganancia neta de la semana ya
  descuenta el pago al trabajador y la merma.

---

## 5. Comprar / Recibir mercancía e insumos

En **Compras** (`/compras/nueva`):

1. Elige proveedor, almacén y agrega las líneas. **El costo se escribe en USD**
   (la cifra real del negocio); el equivalente en CUP se calcula con la tasa.
2. Elige la **forma de pago**:
   - **A crédito** → queda como “cuentas por pagar” (deuda con el proveedor).
   - **De contado** → sale el dinero de la caja.
3. Si es de contado, elige la **moneda del pago**:
   - **USD** → baja la **Caja USD**.
   - **CUP** → baja la **Caja CUP**.
4. La orden nace en **borrador**. Al **recibirla**, sube el stock y se registra
   el costo congelado del día.

> Las cantidades admiten **decimales**, igual que en ventas.

---

## 6. La merma (pérdida o daño de producto)

En **Inventario → Movimientos → Nuevo**, tipo **“Merma”**.

Cuando registras una merma:

- **Baja el stock** del almacén.
- **Baja el valor del inventario** (el dinero que tenías invertido en eso).
- Se registra automáticamente como **gasto “Pérdida por merma”** en la
  contabilidad, con el costo real del producto.
- Aparece restada en el **cuadre semanal** del punto de venta.

👉 Así la merma **sí se ve** como pérdida, no desaparece sin dejar rastro.

---

## 7. Producción y recetas (centros de elaboración)

- **Recetas** (`/recetas`): defines el producto terminado, su **rendimiento**
  (cuánto sale por “vuelta”) y los **insumos** que lleva por unidad. Todo admite
  **decimales** (ej.: 0.250 kg de harina).
- **Producción** (`/produccion/nueva`): eliges la receta, el almacén y cuántas
  “vueltas” producir. Al **producir**:
  - Se **consumen los insumos** del almacén (a su costo real).
  - **Entra el producto terminado**, con su costo = costo de los insumos ÷
    unidades producidas.
- Si produjiste por error y aún no vendiste el terminado, puedes **anular** la
  producción y todo vuelve a su lugar.

---

## 8. Capital, socios e inversión

En **Capital** (`/capital`) ves, en todo momento, **dónde está el dinero**:

- Efectivo (Caja CUP, Caja USD, Banco), inventario por etapa (insumos en el
  centro, terminado en el almacén, mercancía en las tiendas), por cobrar, por
  pagar e **infraestructura**.
- **Capital total en USD** = lo que vale el negocio hoy en dólares.

Acciones desde Capital:

- **Ingresos y gastos manuales**: escribe un ingreso o gasto suelto (elige CUP o
  USD); el sistema lo manda a la caja y a la cuenta correctas.
- **Infraestructura / inversión fija**: registra una compra de equipos/mobiliario
  (en CUP o USD). Baja la caja de esa moneda y se suma a infraestructura.
- **Socios** (`/socios`): aportes de capital por socio y reparto de utilidades.

---

## 9. La contabilidad, en simple

No necesitas ser contador. El sistema **arma los asientos solo** cuando ocurre un
hecho (venta, compra, nómina, remesa, merma, inversión). Quedan en **borrador**
para que el contador los revise y los **contabilice**.

Lo mínimo que conviene entender:

- **Cada asiento siempre cuadra**: lo que entra por un lado sale por otro (debe =
  haber). Por eso el sistema nunca “pierde” dinero.
- **Cuentas principales** (Plan de cuentas en `/contabilidad/cuentas`):

| Código | Cuenta | Significa |
|--------|--------|-----------|
| 1110 | Caja CUP | Efectivo en pesos |
| 1120 | Caja USD | Efectivo en dólares |
| 1130 | Banco | Transferencias / tarjeta |
| 1200 | Cuentas por cobrar | Lo que te deben |
| 1300 | Inventario | Valor de la mercancía/insumos |
| 1500 | Infraestructura | Equipos, mobiliario (inversión fija) |
| 2100 | Cuentas por pagar | Lo que debes a proveedores |
| 4200 | Ventas tienda | Ingresos por ventas |
| 5100 | Costo de ventas | Lo que costó lo que vendiste |
| 5200 | Salarios | Sueldos |
| 5250 | Comisiones de venta | Pago al trabajador del POS |
| 5320 | Pérdida por merma | Lo que se perdió por daño/merma |

- **Balance / estado** (`/contabilidad/balance`): el resumen de saldos de todas
  las cuentas.

Ejemplos de cómo se traduce un hecho a contabilidad (lo hace el sistema):

- **Venta en USD de contado** → entra a *Caja USD (1120)*, se reconoce el
  *ingreso (4200)* y el *costo (5100)*.
- **Compra de contado en CUP** → entra al *Inventario (1300)*, sale de *Caja CUP
  (1110)*.
- **Merma** → *Pérdida por merma (5320)* y baja el *Inventario (1300)*.

---

## 10. Si te equivocas (deshacer)

Casi todo se puede corregir:

- Venta/compra confirmada → se puede **anular** (vuelve a borrador, revierte stock
  y contabilidad).
- Cuadre diario → se puede **reabrir**.
- Producción → se puede **anular** si el terminado no se vendió.
- Ingreso/gasto/inversión manual → se puede **eliminar** (borra su asiento).

> Un asiento ya **contabilizado** está protegido. Para cambiarlo hay que
> descontabilizarlo primero (lo hace el dueño/contador).

---

## 11. Roles (quién ve qué)

Cada usuario tiene un **rol** que define qué módulos ve (Usuarios → rol). El
**admin/dueño** ve todo. Hay accesos finos: por ejemplo, un vendedor vende pero
no borra; el contador ve la contabilidad. Las remesas se asignan **por negocio**
(encargado, gestor, mensajero).

---

## Resumen del flujo diario

1. **Registrar la tasa** del día (Remesas → Tasas).
2. **Vender** durante el día (Ventas / POS).
3. **Comprar / recibir** mercancía e insumos cuando llegue.
4. Registrar **mermas** si hubo daños.
5. Al cerrar, hacer el **cuadre diario**.
6. Una vez por semana, revisar el **cuadre semanal** y el **Capital**.
7. El contador revisa y **contabiliza** los asientos pendientes.
