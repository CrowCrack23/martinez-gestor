# Requisitos del cliente — Reestructuración por Negocios

> Sesión de levantamiento de requisitos con el cliente — 3 de junio de 2026

## Visión general

El cliente quiere separar todo el sistema por **negocios**, no por tiendas, porque en algunos negocios tiene socios y en otros es dueño único. La estructura actual por tiendas mezcla las contabilidades; se necesita **contabilidad separada por negocio** y reparto de ganancias con socios donde aplique.

## Negocios definidos

| Negocio | Socios | Documento |
|---|---|---|
| Ropa | Dueño único | [01-negocio-ropa.md](01-negocio-ropa.md) |
| MIPYME (alimentos) | 3 socios, % fijos no iguales | [02-negocio-mipyme.md](02-negocio-mipyme.md) |
| Remesas EE.UU. | Dueño único | [03-negocio-remesas.md](03-negocio-remesas.md) |
| Remesas Europa | 1 socio (50/50) | [03-negocio-remesas.md](03-negocio-remesas.md) |

## Requisitos transversales

- **Panel general** con el resumen de todos los negocios juntos y cómo va cada uno (patrimonio total + estado por negocio).
- Contabilidad separada por negocio, además de la consolidada.
- **Tasas de cambio** (USD, EUR ↔ CUP) actualizadas diariamente por el dueño.
- Trazabilidad del dinero: dónde está y **quién lo tiene** (incluyendo deudas por persona).
- Solo el dueño accede a la contabilidad (los socios no entran al sistema).
- Diseño escalable: se prevé crecer en puntos de venta y en nuevos negocios/frentes aún no definidos.

## Notas de diseño

- Al modelar, agrupar tiendas, almacenes, inventarios, ventas, gastos y reportes bajo una entidad **negocio**.
- Socios con % configurables por negocio.
- La APK de ventas existente (app móvil de trabajadores) se conecta a los puntos de venta de ropa y mercaditos.
- Se implementará **por partes** (orden de prioridad pendiente de confirmar con el cliente).
