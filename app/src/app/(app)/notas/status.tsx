import { Badge } from "@/components/ui";
import type { Nota } from "@/db/schema";

const MAP: Record<Nota["status"], { label: string; tone: "neutral" | "blue" | "green" | "red" | "gold" }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  processando: { label: "Processando", tone: "gold" },
  autorizada: { label: "Autorizada", tone: "green" },
  erro: { label: "Rejeitada", tone: "red" },
  cancelada: { label: "Cancelada", tone: "red" },
};

export function StatusNota({ status }: { status: Nota["status"] }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
