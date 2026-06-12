import { getCurrentUser } from "@/lib/auth";
import { createErpAgent } from "@/mastra/agents/erp-agent";
import { getProvider, resolveModel } from "@/lib/ai-providers";

// Asistente del administrador (solo lectura). Stateless: el cliente envía toda
// la conversación en cada petición. Solo accesible para el rol admin.

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("admin")) {
    return Response.json({ error: "No autorizado" }, { status: 403 });
  }

  let messages: ChatMessage[];
  let providerId: string | undefined;
  let modelId: string | undefined;
  try {
    const body = (await req.json()) as { messages?: ChatMessage[]; provider?: string; model?: string };
    messages = Array.isArray(body.messages) ? body.messages : [];
    providerId = body.provider;
    modelId = body.model;
  } catch {
    return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  if (messages.length === 0) {
    return Response.json({ error: "No hay mensajes." }, { status: 400 });
  }

  const provider = getProvider(providerId);
  const hasKey = provider.apiKeyEnv.some((k) => !!process.env[k]);
  if (!hasKey) {
    return Response.json(
      { error: `Falta la API key de ${provider.label} en el servidor (${provider.apiKeyEnv[0]}).` },
      { status: 500 },
    );
  }

  try {
    const model = resolveModel(provider.id, modelId);
    const agent = createErpAgent(`${provider.id}/${model}`);
    const payload = messages.map((m) => ({ role: m.role, content: m.content }));
    const result = await agent.generate(
      payload as unknown as Parameters<typeof agent.generate>[0],
    );
    return Response.json({ text: result.text });
  } catch (e) {
    console.error("[asistente] error:", e);
    const msg = e instanceof Error ? e.message : "Error del asistente.";
    return Response.json({ error: msg }, { status: 500 });
  }
}
