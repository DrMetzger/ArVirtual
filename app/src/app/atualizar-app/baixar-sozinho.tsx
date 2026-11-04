"use client";

import { useEffect } from "react";

/** Dentro do app: já começa o download (o app abre o instalador ao terminar). Uma vez por versão, para não repetir. */
export function BaixarSozinho({ versao }: { versao: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("atualizando") === versao) return;
      sessionStorage.setItem("atualizando", versao);
    } catch {
      // sem sessionStorage: baixa mesmo assim
    }
    const t = setTimeout(() => {
      window.location.href = "/baixar/android";
    }, 800);
    return () => clearTimeout(t);
  }, [versao]);
  return null;
}
