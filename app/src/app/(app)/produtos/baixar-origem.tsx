"use client";

import { Download } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { baixarArquivosOrigem } from "./actions";

/** Baixa do site de origem os arquivos de impressão do modelo 3D para este produto. */
export function BaixarArquivosOrigem({ produtoId }: { produtoId: string }) {
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [rodando, iniciar] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" size="sm" variant="outline" disabled={rodando} onClick={() => iniciar(async () => setMsg(await baixarArquivosOrigem(produtoId)))}>
        <Download /> {rodando ? "Baixando..." : "Baixar arquivos do site"}
      </Button>
      {msg ? <span className={msg.erro ? "text-xs text-red" : "text-xs text-green"}>{msg.erro ?? msg.ok}</span> : null}
    </span>
  );
}
