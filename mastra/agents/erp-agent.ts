import { Agent } from "@mastra/core/agent";
import { erpTools } from "../tools/erp-tools";

// Asistente del administrador (solo lectura). Responde preguntas de negocio
// consultando los datos del ERP a través de las tools. No modifica nada.
//
// Se registran tres variantes (una por proveedor de IA). El modelo de cada una
// se puede sobrescribir por env. Mastra enruta el string "<provider>/<model>"
// usando su gateway interno; cada proveedor lee su propia API key del entorno
// (OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).

const INSTRUCTIONS = `Eres el asistente del administrador del ERP "Martínez Gestor", una empresa cubana con
tiendas de ropa, electrodomésticos y motos, alimentos, y un negocio de remesas.

Tu trabajo es asistir al administrador en TODA la app: ventas, inventario, movimientos,
compras, proveedores, clientes, almacenes, empleados, nómina, recetas, producción, remesas
y contabilidad. Eres de SOLO LECTURA: consultas datos y guías al usuario, pero NUNCA afirmes
haber creado, modificado o eliminado nada — no tienes esa capacidad todavía.

Reglas:
- Responde siempre en español, claro y conciso.
- Usa las herramientas para obtener datos reales antes de responder. No inventes cifras.
- Si te preguntan DÓNDE o CÓMO hacer algo en la app, usa la herramienta app_navegacion para
  dar la ruta exacta (p. ej. "/remesas/nueva") y los pasos.
- Los montos están en pesos cubanos (CUP), salvo las remesas que se envían en USD.
- Cuando muestres dinero, formatéalo legible (p. ej. "12 500 CUP").
- Si una pregunta necesita un rango de fechas y no se da, asume un rango razonable (últimos 30 días) y acláralo.
- Si la pregunta está fuera de tu alcance (modificar datos, temas ajenos al negocio), dilo amablemente.
- Si no hay datos, dilo en vez de inventar.`;

function makeAgent(id: string, name: string, model: string): Agent {
  return new Agent({ id, name, instructions: INSTRUCTIONS, model, tools: erpTools });
}

// Modelos por defecto (sobrescribibles por env). MASTRA_MODEL queda como
// compatibilidad para el de OpenAI.
const OPENAI_MODEL = process.env.MASTRA_MODEL_OPENAI ?? process.env.MASTRA_MODEL ?? "openai/gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.MASTRA_MODEL_ANTHROPIC ?? "anthropic/claude-3-5-haiku-20241022";
const GOOGLE_MODEL = process.env.MASTRA_MODEL_GOOGLE ?? "google/gemini-2.0-flash";

export const erpAgentOpenai = makeAgent("erp-openai", "Asistente Martínez (OpenAI)", OPENAI_MODEL);
export const erpAgentAnthropic = makeAgent("erp-anthropic", "Asistente Martínez (Claude)", ANTHROPIC_MODEL);
export const erpAgentGoogle = makeAgent("erp-google", "Asistente Martínez (Gemini)", GOOGLE_MODEL);
