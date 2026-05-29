import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listOrders } from "@/lib/sales";
import { listStock, listMovements, MOVEMENT_TYPE_LABEL } from "@/lib/inventory";
import { stockValuation } from "@/lib/costing";
import { listPurchaseOrders } from "@/lib/purchases";
import { trialBalance } from "@/lib/accounting";
import { listProductsLite } from "@/lib/products-lite";
import { listRemittances } from "@/lib/remittances";
import { listEmployees, listPayrollRuns } from "@/lib/hr";
import { listProductionOrders, listBoms } from "@/lib/production";
import { listCustomers } from "@/lib/customers";
import { listSuppliers } from "@/lib/suppliers";
import { listWarehouses, WAREHOUSE_TYPE_LABEL } from "@/lib/warehouses";

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
  { modulo: "Ventas", ruta: "/ventas/nueva", descripcion: "Venta (POS/online); al confirmar, descuenta stock y genera asiento." },
  { modulo: "Clientes", ruta: "/clientes", descripcion: "Gestión de clientes." },
  { modulo: "Empleados", ruta: "/empleados", descripcion: "Personal, posiciones y salarios." },
  { modulo: "Asistencia", ruta: "/asistencia", descripcion: "Marcar presencia y horas por día." },
  { modulo: "Nómina", ruta: "/nomina/nuevo", descripcion: "Crear período de nómina; calcula sueldos según asistencia." },
  { modulo: "Recetas", ruta: "/recetas", descripcion: "Recetas (BOM): insumos por producto terminado." },
  { modulo: "Producción", ruta: "/produccion/nueva", descripcion: "Orden de producción; consume insumos y produce terminado." },
  { modulo: "Remesas", ruta: "/remesas/nueva", descripcion: "Registrar remesa USD→CUP. Tasas en /remesas/tasas." },
  { modulo: "Contabilidad", ruta: "/contabilidad", descripcion: "Plan de cuentas, asientos y balance." },
  { modulo: "Usuarios", ruta: "/usuarios", descripcion: "Usuarios, roles y negocios asignados." },
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
  navegacionTool,
};
