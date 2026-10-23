import { Badge } from "@/components/ui";
import type { Nota } from "@/db/schema";

const MAP: Record<Nota["status"], { label: string; tone: "neutral" | "blue" | "green" | "red" | "gold" }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  autorizada: { label: "Autorizada", tone: "green" },
  rejeitada: { label: "Rejeitada", tone: "red" },
  denegada: { label: "Denegada", tone: "red" },
  erro: { label: "Pendente na SEFAZ", tone: "gold" },
  cancelada: { label: "Cancelada", tone: "red" },
};

export function StatusNota({ status }: { status: Nota["status"] }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
