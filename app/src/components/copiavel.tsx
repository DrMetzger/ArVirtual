"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Bloco de texto com botão de copiar (URLs e comandos de configuração). */
export function Copiavel({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="grid gap-1">
      {rotulo ? <span className="text-xs font-semibold tracking-wider text-muted uppercase">{rotulo}</span> : null}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-2">
        <code className="min-w-0 flex-1 text-xs break-all whitespace-pre-wrap">{texto}</code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(texto).then(() => (setCopiado(true), setTimeout(() => setCopiado(false), 1500)))}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted hover:text-gold"
          title="Copiar"
        >
          {copiado ? <Check className="size-4 text-green" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
