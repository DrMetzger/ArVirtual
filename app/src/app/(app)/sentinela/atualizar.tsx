"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Enquanto a coleta/relatório roda em segundo plano, recarrega os dados a cada 15 s. */
export function AtualizarSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
