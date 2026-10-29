"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    /** Ponte do app Android (MainActivity): modelo, bateria, localização e id do aparelho, em JSON. */
    ArVirtualApp?: { info(): string };
  }
}

/** Dentro do app Android: manda os dados do aparelho ao abrir, ao voltar para o app e a cada 5 minutos. */
export function RegistrarAparelho() {
  useEffect(() => {
    if (!window.ArVirtualApp) return;
    const enviar = async () => {
      try {
        const info = JSON.parse(window.ArVirtualApp!.info());
        const r = await fetch("/api/aparelhos/registrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(info) });
        const j = (await r.json().catch(() => ({}))) as { bloqueado?: boolean };
        if (j.bloqueado) window.location.href = "/bloqueado";
      } catch {
        // sem conexão: tenta na próxima
      }
    };
    void enviar();
    const t = setInterval(enviar, 5 * 60_000);
    const visivel = () => document.visibilityState === "visible" && void enviar();
    document.addEventListener("visibilitychange", visivel);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", visivel);
    };
  }, []);
  return null;
}
