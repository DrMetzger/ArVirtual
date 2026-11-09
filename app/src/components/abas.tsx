"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Abas que trocam na hora (o conteúdo de todas já vem pronto do servidor). */
export function Abas({ abas, inicial }: { abas: { id: string; rotulo: ReactNode; conteudo: ReactNode }[]; inicial?: string }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.id);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5 sm:gap-2" role="tablist">
        {abas.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ativa === a.id}
            onClick={() => setAtiva(a.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm [&_span]:size-4 sm:[&_span]:size-5",
              ativa === a.id ? "border-gold bg-gold text-[#0a1a33]" : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {abas.map((a) => (
        <div key={a.id} hidden={ativa !== a.id}>
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
