import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listOrders } from "@/lib/sales";
import { listStock, listMovements, MOVEMENT_TYPE_LABEL } from "@/lib/inventory";
import { stockValuation } from "@/lib/costing";
import { listPurchaseOrders } from "@/lib/purchases";
import { trialBalance, incomeStatement } from "@/lib/accounting";
import { listProductsLite } from "@/lib/products-lite";
import { listRemittances } from "@/lib/remittances";
import { listEmployees, listPayrollRuns } from "@/lib/hr";
import { listProductionOrders, listBoms } from "@/lib/production";
import { listCustomers } from "@/lib/customers";
import { listSuppliers } from "@/lib/suppliers";
import { listWarehouses, WAREHOUSE_TYPE_LABEL } from "@/lib/warehouses";
import { getCurrentRate, getRates } from "@/lib/currency";
import { listBusinessesLite } from "@/lib/businesses";
import { capitalSnapshot } from "@/lib/capital";
import { holderBalances, HOLDER_KIND_LABEL, HOLDER_LOCATION_LABEL } from "@/lib/money-holders";
import { listDailyClosures } from "@/lib/closures";
import { listPartners, getGrowthPct } from "@/lib/partners";
import { listDistributions } from "@/lib/profit-sharing";

// Tools de SOLO LECTURA para el asistente del administrador. Envuelven las
// funciones de lib/ ya existentes. Como el asistente es solo para el admin, el
// alcance (scope) es total: no se pasa filtro de negocio.
//
// Devuelven datos compactos y acotados para no inflar el contexto ni el costo.

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const ventasResumenTool = createTool({
  id: "ventas_resumen",
  description:
    "Resumen de ventas confirmadas en un rango de fechas: total facturado, número de órdenes y desglose por almacén/tienda. Si no se dan fechas, usa los últimos 30 días.",
  inputSchema: z.object({
    desde: z.string().describe("Fecha inicio YYYY-MM-DD").optional(),
    hasta: z.string().describe("Fecha fin YYYY-MM-DD").optional(),
  }),
  execute: async ({ desde: d, hasta: h }) => {
    const desde = d ?? daysAgoISO(30);
    const hasta = h ?? todayISO();
    const orders = await listOrders({ status: "confirmada" });
    const inRange = orders.filter((o) => {
      const day = o.created_at.slice(0, 10);
      return day >= desde && day <= hasta;
    });
    const total = inRange.reduce((s, o) => s + o.total_amount, 0);
    const porTienda: Record<string, { total: number; ordenes: number }> = {};
    for (const o of inRange) {
      const k = o.warehouse_name || "—";
      porTienda[k] = porTienda[k] ?? { total: 0, ordenes: 0 };
      porTienda[k].total += o.total_amount;
      porTienda[k].ordenes += 1;
    }
    return { desde, hasta, total_facturado: total, numero_ordenes: inRange.length, por_tienda: porTienda };
  },
});

export const bajoStockTool = createTool({
  id: "inventario_bajo_stock",
  description: "Productos en o por debajo del stock mínimo, por almacén. Útil para saber qué reponer.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await listStock({ lowOnly: true });
    return {
      cantidad: rows.length,
      items: rows.slice(0, 50).map((r) => ({
        producto: r.product_name,
        almacen: r.warehouse_name,
        cantidad: r.quantity,
        minimo: r.min_stock,
      })),
    };
  },
});

export const valorInventarioTool = createTool({
  id: "inventario_valor",
  description: "Valor total del inventario (costo) y los productos de mayor valor en stock.",
  inputSchema: z.object({}),
  execute: async () => {
    const [rows, valuation] = await Promise.all([listStock(), stockValuation()]);
    let total = 0;
    const items = rows.map((r) => {
      const v = valuation[`${r.product_id}::${r.warehouse_id}`];
      const value = v?.value ?? 0;
      total += value;
      return { producto: r.product_name, almacen: r.warehouse_name, cantidad: r.quantity, valor: value };
    });
    items.sort((a, b) => b.valor - a.valor);
    return { valor_total: total, top: items.slice(0, 15) };
  },
});

export const comprasTool = createTool({
  id: "compras_listar",
  description:
    "Lista órdenes de compra. Filtra por estado opcional: 'borrador' (pendientes de recibir), 'recibida', 'cancelada'.",
  inputSchema: z.object({
    estado: z.enum(["borrador", "recibida", "cancelada"]).optional(),
  }),
  execute: async ({ estado }) => {
    const orders = await listPurchaseOrders({ status: estado });
    return {
      cantidad: orders.length,
      ordenes: orders.slice(0, 40).map((o) => ({
        codigo: o.code,
        proveedor: o.supplier_name,
        almacen: o.warehouse_name,
        estado: o.status,
        total: o.total_amount,
        fecha: o.created_at.slice(0, 10),
      })),
    };
  },
});

export const balanceTool = createTool({
  id: "contabilidad_balance",
  description:
    "Balance de comprobación (saldos por cuenta) en un rango de fechas. Por defecto solo asientos contabilizados.",
  inputSchema: z.object({
    desde: z.string().describe("YYYY-MM-DD").optional(),
    hasta: z.string().describe("YYYY-MM-DD").optional(),
    incluir_borradores: z.boolean().optional(),
  }),
  execute: async ({ desde, hasta, incluir_borradores }) => {
    const rows = await trialBalance({
      from: desde,
      to: hasta,
      postedOnly: !incluir_borradores,
    });
    return {
      cuentas: rows.map((r) => ({
        codigo: r.account_code,
        nombre: r.account_name,
        tipo: r.type,
        saldo: r.balance,
      })),
    };
  },
});

export const buscarProductoTool = createTool({
  id: "productos_buscar",
  description: "Busca productos del catálogo por texto en el nombre. Devuelve id, nombre, tienda, categoría y precio.",
  inputSchema: z.object({
    texto: z.string().describe("Texto a buscar en el nombre del producto"),
  }),
  execute: async ({ texto }) => {
    const q = texto.toLowerCase();
    const all = await listProductsLite();
    const hits = all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 25);
    return {
      cantidad: hits.length,
      productos: hits.map((p) => ({ id: p.id, nombre: p.name, tienda: p.store, categoria: p.category, precio: p.price })),
    };
  },
});

export const movimientosTool = createTool({
  id: "inventario_movimientos",
  description: "Últimos movimientos de inventario (entradas, salidas, transferencias, ajustes, mermas).",
  inputSchema: z.object({ limite: z.number().int().min(1).max(100).optional() }),
  execute: async ({ limite }) => {
    const rows = await listMovements(limite ?? 30);
    return {
      cantidad: rows.length,
      movimientos: rows.map((m) => ({
        tipo: MOVEMENT_TYPE_LABEL[m.type],
        origen: m.warehouse_from_name,
        destino: m.warehouse_to_name,
        unidades: m.total_quantity,
        usuario: m.user_name,
        fecha: m.created_at.slice(0, 10),
        notas: m.notes,
      })),
    };
  },
});

export const almacenesTool = createTool({
  id: "almacenes_listar",
  description: "Lista de almacenes/tiendas (negocios) con su tipo y estado.",
  inputSchema: z.object({}),
  execute: async () => {
    const ws = await listWarehouses();
    return {
      cantidad: ws.length,
      almacenes: ws.map((w) => ({
        codigo: w.code,
        nombre: w.name,
        tipo: WAREHOUSE_TYPE_LABEL[w.type],
        tienda: w.store_slug,
        activo: w.active,
      })),
    };
  },
});

export const remesasTool = createTool({
  id: "remesas_listar",
  description:
    "Operaciones de remesas. Filtra por estado ('pendiente'|'entregada'|'cancelada') y/o por origen ('eeuu' en USD | 'europa' en EUR). El monto está en la moneda del origen.",
  inputSchema: z.object({
    estado: z.enum(["pendiente", "entregada", "cancelada"]).optional(),
    origen: z.enum(["eeuu", "europa"]).optional(),
  }),
  execute: async ({ estado, origen }) => {
    const list = await listRemittances({ status: estado, origin: origen });
    const sum = (o: "eeuu" | "europa") =>
      list.filter((r) => r.origin === o).reduce((s, r) => s + r.amount_usd, 0);
    return {
      cantidad: list.length,
      total_enviado_usd_eeuu: sum("eeuu"),
      total_enviado_eur_europa: sum("europa"),
      total_comision: list.reduce((s, r) => s + r.commission_usd, 0),
      remesas: list.slice(0, 40).map((r) => ({
        codigo: r.code,
        origen: r.origin === "eeuu" ? "EEUU (USD)" : "Europa (EUR)",
        beneficiario: r.beneficiary_name,
        monto: r.amount_usd,
        moneda: r.origin === "eeuu" ? "USD" : "EUR",
        cup: r.amount_cup,
        comision: r.commission_usd,
        estado: r.status,
        fecha: r.created_at.slice(0, 10),
      })),
    };
  },
});

export const empleadosTool = createTool({
  id: "empleados_listar",
  description: "Lista de empleados con su posición, sucursal y salario mensual.",
  inputSchema: z.object({ solo_activos: z.boolean().optional() }),
  execute: async ({ solo_activos }) => {
    let emps = await listEmployees();
    if (solo_activos) emps = emps.filter((e) => e.active);
    const nomina = emps.filter((e) => e.active).reduce((s, e) => s + e.monthly_salary, 0);
    return {
      cantidad: emps.length,
      nomina_mensual_activos: nomina,
      empleados: emps.slice(0, 60).map((e) => ({
        nombre: `${e.first_name} ${e.last_name}`.trim(),
        posicion: e.position_name,
        sucursal: e.warehouse_name,
        salario: e.monthly_salary,
        activo: e.active,
      })),
    };
  },
});

export const nominaTool = createTool({
  id: "nomina_listar",
  description: "Períodos de nómina y su estado (borrador / cerrada).",
  inputSchema: z.object({}),
  execute: async () => {
    const runs = await listPayrollRuns();
    return {
      cantidad: runs.length,
      periodos: runs.slice(0, 24).map((r) => ({
        periodo: `${r.period_start} a ${r.period_end}`,
        estado: r.status,
        notas: r.notes,
      })),
    };
  },
});

export const produccionTool = createTool({
  id: "produccion_listar",
  description: "Órdenes de producción y recetas (BOM). Devuelve órdenes recientes y las recetas activas.",
  inputSchema: z.object({}),
  execute: async () => {
    const [orders, boms] = await Promise.all([listProductionOrders(), listBoms()]);
    return {
      ordenes: orders.slice(0, 30).map((o) => ({
        codigo: o.code,
        receta: o.bom_name,
        producto: o.finished_product_name,
        almacen: o.warehouse_name,
        cantidad: o.quantity,
        estado: o.status,
        fecha: o.created_at.slice(0, 10),
      })),
      recetas: boms.filter((b) => b.active).map((b) => ({ nombre: b.name, producto: b.product_name, rendimiento: b.yield })),
    };
  },
});

export const clientesTool = createTool({
  id: "clientes_buscar",
  description: "Busca clientes por nombre/teléfono. Sin texto, devuelve los primeros activos.",
  inputSchema: z.object({ texto: z.string().optional() }),
  execute: async ({ texto }) => {
    const all = await listCustomers();
    const q = (texto ?? "").toLowerCase();
    const hits = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)) : all;
    return {
      cantidad: hits.length,
      clientes: hits.slice(0, 30).map((c) => ({ nombre: c.name, telefono: c.phone, email: c.email, activo: c.active })),
    };
  },
});

export const proveedoresTool = createTool({
  id: "proveedores_buscar",
  description: "Busca proveedores por nombre. Sin texto, devuelve los primeros.",
  inputSchema: z.object({ texto: z.string().optional() }),
  execute: async ({ texto }) => {
    const all = await listSuppliers();
    const q = (texto ?? "").toLowerCase();
    const hits = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
    return {
      cantidad: hits.length,
      proveedores: hits.slice(0, 30).map((s) => ({ nombre: s.name, contacto: s.contact_name, telefono: s.phone, activo: s.active })),
    };
  },
});

export const tasaTool = createTool({
  id: "tasa_actual",
  description:
    "Tasa de cambio del día. USD es la moneda funcional (rectora) del negocio: la tasa USD→CUP se registra a mano cada día. Devuelve la última tasa, su fecha, antigüedad y si está vencida (con >3 días las operaciones de compra/venta se bloquean). También la tasa EUR→CUP.",
  inputSchema: z.object({}),
  execute: async () => {
    const [usd, rates] = await Promise.all([getCurrentRate(), getRates()]);
    return {
      usd_cup: usd ? usd.rate : null,
      fecha: usd?.day ?? null,
      antiguedad_dias: usd?.ageDays ?? null,
      vencida: usd?.stale ?? null,
      eur_cup: rates.EUR,
      nota: usd
        ? usd.stale
          ? "La tasa está vencida (>3 días). Las compras/ventas se bloquean hasta registrar la tasa del día en /remesas/tasas."
          : "Tasa vigente."
        : "No hay tasa USD→CUP registrada. Regístrala en /remesas/tasas.",
    };
  },
});

export const resultadosTool = createTool({
  id: "contabilidad_resultados",
  description:
    "Estado de resultados (ganancias y pérdidas) en un rango de fechas: ingresos, gastos y utilidad neta, en CUP y en USD (la utilidad en USD es la real, congelada por transacción). Filtra por negocio opcional (slug, p.ej. 'ropa' o 'remesas'). Por defecto solo asientos contabilizados y los últimos 30 días.",
  inputSchema: z.object({
    desde: z.string().describe("YYYY-MM-DD").optional(),
    hasta: z.string().describe("YYYY-MM-DD").optional(),
    negocio: z.string().describe("slug del negocio; vacío = consolidado").optional(),
    incluir_borradores: z.boolean().optional(),
  }),
  execute: async ({ desde, hasta, negocio, incluir_borradores }) => {
    const pl = await incomeStatement({
      from: desde ?? daysAgoISO(30),
      to: hasta ?? todayISO(),
      business: negocio,
      postedOnly: !incluir_borradores,
    });
    return {
      desde: desde ?? daysAgoISO(30),
      hasta: hasta ?? todayISO(),
      negocio: negocio ?? "consolidado",
      ingresos_cup: pl.totalIncome,
      gastos_cup: pl.totalExpense,
      utilidad_cup: pl.netIncome,
      ingresos_usd: pl.totalIncomeUsd,
      gastos_usd: pl.totalExpenseUsd,
      utilidad_usd: pl.netIncomeUsd,
    };
  },
});

export const capitalTool = createTool({
  id: "capital_resumen",
  description:
    "Dónde está el capital de un negocio en este momento: efectivo, inventario valuado, cuentas por cobrar/pagar e infraestructura, con el total en USD (moneda rectora) y CUP. Requiere el slug del negocio (usa negocios_listar si no lo conoces).",
  inputSchema: z.object({
    negocio: z.string().describe("slug del negocio (p.ej. 'mipyme', 'ropa')"),
  }),
  execute: async ({ negocio }) => {
    const s = await capitalSnapshot(negocio);
    return {
      negocio,
      capital_total_usd: s.capitalTotalUsd,
      capital_total_cup: s.capitalTotal,
      efectivo_cup: s.cash.total,
      efectivo_usd: s.cash.totalUsd,
      inventario_cup: s.inventory.total,
      inventario_usd: s.inventory.totalUsd,
      cuentas_por_cobrar_cup: s.receivables,
      cuentas_por_pagar_cup: s.payables,
      infraestructura_cup: s.infrastructure,
      aportado_por_socios_cup: s.contributed.total,
    };
  },
});

export const dineroRemesasTool = createTool({
  id: "remesas_dinero",
  description:
    "Quién tiene el dinero del negocio de remesas en cada momento: mensajeros con efectivo pendiente, deudores y cajas, con saldos por moneda y totales allá (origen) vs acá (Cuba). Negocio: 'remesas_eeuu' (USD) o 'remesas_europa' (EUR).",
  inputSchema: z.object({
    negocio: z.enum(["remesas_eeuu", "remesas_europa"]).optional(),
  }),
  execute: async ({ negocio }) => {
    const business = negocio ?? "remesas_eeuu";
    const overview = await holderBalances(business);
    return {
      negocio: business,
      por_ubicacion: {
        alla: overview.byLocation.alla,
        aca: overview.byLocation.aca,
      },
      tenedores: overview.holders
        .filter((h) => Object.values(h.balances).some((v) => v && Math.abs(v) >= 0.01))
        .map((h) => ({
          nombre: h.holder.name,
          tipo: HOLDER_KIND_LABEL[h.holder.kind],
          ubicacion: HOLDER_LOCATION_LABEL[h.holder.location],
          saldos: h.balances,
        })),
    };
  },
});

export const cuadresTool = createTool({
  id: "cuadres_recientes",
  description:
    "Cuadres diarios confirmados de los puntos de venta: ventas, ganancia, comisión del trabajador y desglose del dinero (efectivo / transferencia / USD) por día.",
  inputSchema: z.object({ limite: z.number().int().min(1).max(60).optional() }),
  execute: async ({ limite }) => {
    const rows = await listDailyClosures({ limit: limite ?? 20 });
    return {
      cantidad: rows.length,
      cuadres: rows.map((c) => ({
        dia: c.day,
        punto: c.warehouse_name,
        ventas_cup: c.revenue_cup,
        ganancia_cup: c.profit_cup,
        comision_cup: c.commission_cup,
        efectivo_cup: c.cash_cup,
        transferencia_cup: c.transfer_cup,
        usd: c.usd_total,
      })),
    };
  },
});

export const sociosTool = createTool({
  id: "socios_reparto",
  description:
    "Socios de un negocio con su % fijo de la ganancia, el % de crecimiento que se reinvierte, y el historial de repartos mensuales con su estado (calculada / pagada). Requiere el slug del negocio.",
  inputSchema: z.object({
    negocio: z.string().describe("slug del negocio (p.ej. 'mipyme', 'remesas_europa')"),
  }),
  execute: async ({ negocio }) => {
    const [partners, growthPct, distributions] = await Promise.all([
      listPartners(negocio),
      getGrowthPct(negocio),
      listDistributions(negocio),
    ]);
    return {
      negocio,
      crecimiento_empresa_pct: growthPct,
      socios: partners.map((p) => ({ nombre: p.name, porcentaje: p.profit_pct, activo: p.active })),
      repartos: distributions.slice(0, 12).map((d) => ({
        mes: d.period_month.slice(0, 7),
        ganancia_base_cup: d.base_profit,
        a_repartir_cup: d.distributable,
        estado: d.status,
      })),
    };
  },
});

export const negociosTool = createTool({
  id: "negocios_listar",
  description:
    "Lista los negocios (dimensión contable): tiendas y remesas, con su slug, nombre y tipo. Usa los slugs para las demás herramientas (capital, resultados, socios).",
  inputSchema: z.object({}),
  execute: async () => {
    const list = await listBusinessesLite();
    return { negocios: list.map((b) => ({ slug: b.slug, nombre: b.label, tipo: b.kind })) };
  },
});

// ── Guía / navegación de la app ─────────────────────────────────────────────

const APP_MAP: { modulo: string; ruta: string; descripcion: string }[] = [
  { modulo: "Dashboard", ruta: "/", descripcion: "Resumen general: stock, alertas, últimos movimientos." },
  { modulo: "Productos", ruta: "/productos", descripcion: "Catálogo. Crear/editar productos; bandera de visible online. Stock se lleva en Inventario." },
  { modulo: "Inventario", ruta: "/inventario", descripcion: "Stock por producto y almacén, con costo y valor." },
  { modulo: "Movimientos", ruta: "/inventario/movimientos/nuevo", descripcion: "Registrar entrada, salida, transferencia, ajuste o merma." },
  { modulo: "Lotes y costos", ruta: "/inventario/lotes", descripcion: "Lotes FIFO y costeo del inventario." },
  { modulo: "Almacenes", ruta: "/almacenes", descripcion: "Tiendas/almacenes (negocios)." },
  { modulo: "Proveedores", ruta: "/proveedores", descripcion: "Gestión de proveedores." },
  { modulo: "Compras", ruta: "/compras/nueva", descripcion: "Orden de compra; al recibir, suma stock y genera asiento contable." },
  { modulo: "Ventas", ruta: "/ventas/nueva", descripcion: "Venta (POS/online); al confirmar, descuenta stock y genera asiento. Una venta confirmada se puede anular desde su detalle (solo admin)." },
  { modulo: "Cuadres", ruta: "/cuadres", descripcion: "Cuadre diario del punto de venta: ventas del día, comisión del trabajador y desglose del dinero. /cuadres/semanal para el reporte semanal." },
  { modulo: "Puntos de venta", ruta: "/puntos-venta", descripcion: "Personal asignado a cada punto de venta y su % de comisión." },
  { modulo: "Clientes", ruta: "/clientes", descripcion: "Gestión de clientes." },
  { modulo: "Empleados", ruta: "/empleados", descripcion: "Personal, posiciones y salarios." },
  { modulo: "Asistencia", ruta: "/asistencia", descripcion: "Marcar presencia y horas por día." },
  { modulo: "Nómina", ruta: "/nomina/nuevo", descripcion: "Crear período de nómina; calcula sueldos según asistencia." },
  { modulo: "Recetas", ruta: "/recetas", descripcion: "Recetas (BOM): insumos por producto terminado." },
  { modulo: "Producción", ruta: "/produccion/nueva", descripcion: "Orden de producción; consume insumos y produce terminado." },
  { modulo: "Remesas", ruta: "/remesas/nueva", descripcion: "Registrar remesa. Tasas del día en /remesas/tasas; quién tiene el dinero en /remesas/dinero; cuadre semanal en /remesas/cuadre." },
  { modulo: "Tasas de cambio", ruta: "/remesas/tasas", descripcion: "Registrar a mano la tasa USD→CUP del día. Sin tasa fresca, compras y ventas se bloquean." },
  { modulo: "Contabilidad", ruta: "/contabilidad", descripcion: "Plan de cuentas, asientos y balance. Estado de resultados (P&L) en /contabilidad/resultados." },
  { modulo: "Capital", ruta: "/capital", descripcion: "Dónde está el capital del negocio: efectivo, inventario, CxC/CxP e infraestructura. También registrar ingresos/gastos manuales." },
  { modulo: "Socios", ruta: "/socios", descripcion: "Socios por negocio con su % de ganancia. Aportes en /socios/aportes; reparto mensual en /socios/reparto." },
  { modulo: "Usuarios", ruta: "/usuarios", descripcion: "Usuarios, roles y negocios asignados." },
  { modulo: "Asistente", ruta: "/asistente", descripcion: "Este asistente (solo admin)." },
];

export const navegacionTool = createTool({
  id: "app_navegacion",
  description:
    "Devuelve el mapa de módulos del ERP con sus rutas y qué se hace en cada uno. Úsalo para guiar al usuario sobre DÓNDE y CÓMO realizar una tarea en la app.",
  inputSchema: z.object({ tema: z.string().optional().describe("Palabra clave opcional para filtrar módulos") }),
  execute: async ({ tema }) => {
    const q = (tema ?? "").toLowerCase();
    const items = q
      ? APP_MAP.filter((m) => m.modulo.toLowerCase().includes(q) || m.descripcion.toLowerCase().includes(q))
      : APP_MAP;
    return { modulos: items.length ? items : APP_MAP };
  },
});

export const erpTools = {
  ventasResumenTool,
  bajoStockTool,
  valorInventarioTool,
  comprasTool,
  balanceTool,
  buscarProductoTool,
  movimientosTool,
  almacenesTool,
  remesasTool,
  empleadosTool,
  nominaTool,
  produccionTool,
  clientesTool,
  proveedoresTool,
  tasaTool,
  resultadosTool,
  capitalTool,
  dineroRemesasTool,
  cuadresTool,
  sociosTool,
  negociosTool,
  navegacionTool,
};
