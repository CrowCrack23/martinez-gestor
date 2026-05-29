import { requirePermission } from "@/lib/auth";
import { AssistantChat } from "@/components/assistant-chat";

export default async function AsistentePage() {
  await requirePermission("asistente");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Asistente</h1>
        <p className="text-sm text-muted-foreground">
          Consulta el estado del negocio en lenguaje natural. Solo lectura.
        </p>
      </div>
      <AssistantChat />
    </div>
  );
}
