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

// ── Modelos por proveedor ────────────────────────────────────────────────────
// Catálogo editable: ajusta los IDs a los que tu cuenta/API key soporta. El
// primero de cada lista es el modelo por defecto. Para Mastra el string final es
// `<provider>/<model>` (p.ej. "openai/gpt-5").

export type AiModel = { id: string; label: string };

export const AI_MODELS: Record<ProviderId, AiModel[]> = {
  openai: [
    { id: "gpt-5", label: "GPT-5" },
    { id: "gpt-5-mini", label: "GPT-5 mini" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  google: [
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

export function getModels(providerId: ProviderId): AiModel[] {
  return AI_MODELS[providerId] ?? [];
}

/** Modelo por defecto de un proveedor (el primero del catálogo). */
export function defaultModel(providerId: ProviderId): string {
  return AI_MODELS[providerId]?.[0]?.id ?? "";
}

/** Valida un modelo pedido contra el catálogo del proveedor; cae al default si no es válido. */
export function resolveModel(providerId: ProviderId, modelId: string | undefined | null): string {
  const list = AI_MODELS[providerId] ?? [];
  const found = modelId ? list.find((m) => m.id === modelId) : undefined;
  return found?.id ?? defaultModel(providerId);
}
