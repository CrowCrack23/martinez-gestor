# MIPYME (elaboración y venta de alimentos)

> Requisitos del cliente — 3 de junio de 2026. Parte de la [reestructuración por negocios](00-vision-general.md).

## Estructura

- **3 socios** (el cliente es uno de ellos).
  - Capital inicial aportado por **2 de los 3 socios**.
  - Los **% de los socios son fijos y no a partes iguales**. El socio que no aportó capital también recibe %.
  - **Solo el cliente accede a la contabilidad** (los socios no entran al sistema).
- Componentes: **centro de elaboración de alimentos** + **3 puntos de venta** tipo mercaditos.
  - Planes de expansión: más puntos de venta y más frentes aún no definidos → diseño flexible/escalable.
- **Almacén central** que reparte mercancía a los puntos de venta **según demanda**.
- El centro de elaboración y cada punto de venta tienen **inventario propio**.
- **Contabilidad por unidad** (centro y cada punto por separado) **+ contabilidad general consolidada**.

## Centro de elaboración

- Se compran **insumos** (las compras las registra un encargado designado o el cliente).
- Se elabora a partir de **recetas**: p. ej., X cantidad de croquetas requiere X cantidad de insumos.
  - Al elaborar, los insumos se **descuentan automáticamente del almacén**.
  - La receta **calcula automáticamente el costo de producción** del producto (suma del costo de insumos) → ganancia real por producto vendido.
- Flujo del producto elaborado: **centro → almacén central → puntos de venta según demanda**.
- Por ahora el centro **solo produce para los mercaditos**; en el futuro también **venderá directo al público** (preverlo en el diseño).

## Dinero, capital y reparto

- Se maneja **CUP y USD con tasa diaria** (igual que el negocio de ropa).
- **Pago a trabajadores**: pago fijo + %, **según el puesto**.
- **Reparto de ganancias**: un % fijo para los socios y otro % para la empresa (reinversión/crecimiento).
  - El % de crecimiento es **modificable** por el cliente según haga falta.
  - **Reparto mensual**: el sistema calcula cuánto le toca a cada socio y el cliente registra cuándo efectúa el pago.
- **Capital con trazabilidad total**: debe quedar claro en todo momento dónde está el capital:
  - **Dinero en movimiento**: insumos, producto elaborado, mercancía en puntos, efectivo.
  - **Infraestructura**: inversión fija que no se mueve (se registra aparte del capital circulante).

## Ventas y cuadres

- Los mercaditos usan la **misma APK de ventas** que el negocio de ropa.
- **Cuadres diario y semanal: funcionan igual que en el negocio de ropa** ([01-negocio-ropa.md](01-negocio-ropa.md)): diario con productos vendidos, costos CUP/USD, pago del trabajador, dinero por forma de pago; semanal con ganancia neta, comparaciones y sugerencias.
