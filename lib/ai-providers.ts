// Catálogo de proveedores de IA disponibles para el asistente.
// Client-safe (sin server-only): lo usan tanto la UI como el route handler.

export type ProviderId = "openai" | "anthropic" | "google";

export type AiProvider = {
  id: ProviderId;
  label: string;
  agentKey: string; // clave registrada en mastra/index.ts
  apiKeyEnv: string[]; // nombres de env válidos para su API key
};

export const AI_PROVIDERS: AiProvider[] = [
  { id: "openai", label: "OpenAI (ChatGPT)", agentKey: "erpOpenai", apiKeyEnv: ["OPENAI_API_KEY"] },
  { id: "anthropic", label: "Anthropic (Claude)", agentKey: "erpAnthropic", apiKeyEnv: ["ANTHROPIC_API_KEY"] },
  { id: "google", label: "Google (Gemini)", agentKey: "erpGoogle", apiKeyEnv: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"] },
];

export const DEFAULT_PROVIDER: ProviderId = "openai";

export function getProvider(id: string | undefined | null): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0];
}
