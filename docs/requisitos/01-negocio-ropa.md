# Negocio de Ropa

> Requisitos del cliente — 3 de junio de 2026. Parte de la [reestructuración por negocios](00-vision-general.md).

## Estructura

- **Dueño único, sin socios.** Contabilidad totalmente separada del resto de los negocios.
- **Almacén propio**: las entradas de mercancía las registra un usuario encargado o el dueño.
- Flujo de mercancía: **almacén → surte a la tienda → la venta descuenta del inventario de la tienda**.
- Mercancía manejada por **producto general** (sin tallas/colores).
- **Puntos de venta**: hoy 1 solo, pero el diseño debe soportar varios (planes de expansión).
- Cada punto de venta tiene **un trabajador fijo** asignado.

## Ventas (APK móvil)

- Se vende desde la **APK existente** (app móvil de trabajadores), usada por los vendedores.
- El vendedor indica la forma de pago: **efectivo CUP / transferencia / USD**.
- Cada venta tiene **una sola forma de pago** (sin pagos mixtos).

## Dinero y pagos

- **Tasa de cambio CUP↔USD**: la actualiza el dueño diariamente.
- **Pago a trabajadores**: un **% de la ganancia** (venta − costo) de las ventas de **su punto de venta**.
  - El % varía por trabajador (acuerdo negociable entre dueño y trabajador → debe ser editable).
  - El pago se descuenta del dinero del cuadre.

## Cuadre diario

Debe mostrar:

1. Productos vendidos en el día (descontados automáticamente del inventario).
2. Precio de **costo** de lo vendido, en **CUP y USD**.
3. **Pago de los trabajadores** del día.
4. Dinero disponible desglosado: **efectivo CUP / transferencia / USD**.

## Cuadre semanal

- Suma de la semana y **ganancia neta semanal**.
- **Comparaciones entre semanas**.
- **Sugerencias de mejora**:
  - Producto que más se vende ("trae más").
  - Día que más se vende.
  - Producto que menos se vende.
  - Producto que más ganancia da.
