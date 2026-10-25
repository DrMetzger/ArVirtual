"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

// Erros típicos de página aberta antes de um deploy (versão antiga no navegador): recarregar resolve.
const VERSAO_ANTIGA = /Server Action|older or newer deployment|ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch/i;
const CHAVE = "arv_recarregado_em";

export function ErroPagina({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const versaoAntiga = VERSAO_ANTIGA.test(error.message);

  useEffect(() => {
    if (!versaoAntiga) return;
    // Recarrega sozinho uma vez (se já recarregou há menos de 30 s, mostra a tela para não entrar em loop).
    let ultimo = 0;
    try {
      ultimo = Number(sessionStorage.getItem(CHAVE)) || 0;
      sessionStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      // sem sessionStorage: segue para a tela
    }
    if (Date.now() - ultimo > 30_000) window.location.reload();
  }, [versaoAntiga]);

  return (
    <div className="grid min-h-[60vh] place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold">
          <TriangleAlert className="size-7" />
        </div>
        <h1 className="mt-4 font-display text-xl font-extrabold">
          {versaoAntiga ? "O sistema foi atualizado" : "Não foi possível carregar esta página"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {versaoAntiga
            ? "Esta página estava aberta antes da atualização. Recarregando..."
            : "Tente de novo. Se continuar, avise o suporte com o código abaixo."}
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p> : null}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gold px-4 text-sm font-semibold text-[#0a1a33] hover:brightness-110"
          >
            <RefreshCw className="size-4" /> Recarregar
          </button>
          {reset && !versaoAntiga ? (
            <button type="button" onClick={reset} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold hover:border-gold hover:text-gold">
              Tentar de novo
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
