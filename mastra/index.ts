import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { erpAgentOpenai, erpAgentAnthropic, erpAgentGoogle } from "./agents/erp-agent";

// Instancia mínima de Mastra para el asistente del administrador.
// Sin storage/observability/DuckDB: el agente es stateless (la conversación se
// envía completa en cada petición), así evitamos binarios nativos en el build.
// Tres agentes: uno por proveedor de IA (claves erpOpenai / erpAnthropic / erpGoogle).
export const mastra = new Mastra({
  agents: {
    erpOpenai: erpAgentOpenai,
    erpAnthropic: erpAgentAnthropic,
    erpGoogle: erpAgentGoogle,
  },
  logger: new PinoLogger({ name: "Mastra", level: "info" }),
});
