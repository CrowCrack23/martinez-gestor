"use client";
import { useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AI_PROVIDERS, DEFAULT_PROVIDER, type ProviderId } from "@/lib/ai-providers";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "¿Cuánto se vendió en los últimos 30 días?",
  "¿Qué productos están bajo stock mínimo?",
  "¿Cuál es el valor total del inventario?",
  "Muéstrame las órdenes de compra en borrador",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del asistente.");
      setMessages((cur) => [...cur, { role: "assistant", content: data.text ?? "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error.");
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] max-w-3xl">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Pregúntame sobre ventas, inventario, compras o contabilidad. Consulto los datos reales del ERP (solo lectura).</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="px-3 py-1.5 rounded-full border border-input text-xs hover:bg-accent text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Pensando…
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-sm px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 items-end border-t pt-3"
      >
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as ProviderId)}
          aria-label="Proveedor de IA"
          className="h-10 shrink-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Escribe tu pregunta…"
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-10 max-h-40"
        />
        <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Enviar">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
