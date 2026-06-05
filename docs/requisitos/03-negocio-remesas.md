# Remesas — EE.UU. y Europa (dos negocios separados)

> Requisitos del cliente — 3 de junio de 2026. Parte de la [reestructuración por negocios](00-vision-general.md).

Las remesas se hacen desde **Estados Unidos** y desde **Europa**, y deben tratarse como **dos negocios separados**:

| | Remesas EE.UU. | Remesas Europa |
|---|---|---|
| Socios | Solo el cliente | **1 socio** (solo participa en Europa) |
| Reparto | — | Ganancias **a partes iguales (50/50)** |
| Cuadre | Semanal (ganancias) | Semanal (ver abajo) |

## Ciclo de la remesa

- El cliente de la remesa paga **USD o EUR** allá (EE.UU./Europa).
- Se entrega en Cuba en **CUP, USD o EUR**, según lo que pida el cliente.
- **Ganancia**: comisiones por envío **+** diferencias de tasas.
- **Tasas de cambio**: las actualiza el dueño diariamente (USD/CUP, EUR/CUP, etc.).

## Capital y trazabilidad

- Cada negocio tiene un **capital que se va moviendo**.
- Se necesita ver en todo momento:
  - Cuánto dinero hay **allá** (EE.UU./Europa) y cuánto **acá** (Cuba).
  - **Quién tiene el dinero** en cada momento (trazabilidad por persona/tenedor).
- Tenedores de dinero: **mensajeros** con efectivo pendiente de entregar, y **deudores** (personas que deben y no han pagado) → el sistema debe rastrear deudas por persona.

## Mensajeros

- **Mensajeros distintos** para cada negocio (EE.UU. y Europa no comparten mensajeros).
- Se les paga **por entrega**.

## Cuadres semanales

- **Europa**: remesas entregadas, ganancia de la semana, cuánto le toca a cada socio (50/50), y pago de mensajeros.
- **EE.UU.**: cuadre semanal con las ganancias (sin reparto de socio).

## Nota técnica

El sistema ya tiene un módulo de remesas con rol de mensajero/courier y asignación de remesas (commits de junio 2026) — habrá que separarlo en estos dos negocios dentro de la nueva estructura.
