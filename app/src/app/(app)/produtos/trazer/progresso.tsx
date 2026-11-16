"use client";

import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui";
import { trazerEmAndamento } from "./actions";

export type EstadoTela = { rodando: boolean; feitos: number; total: number; atual: string; criados: { id: string; nome: string }[]; ligados: number; erros: string[] };

/** Progresso ao vivo: pergunta ao servidor a cada 3 s e só atualiza este quadro (a página não recarrega). */
export function ProgressoTrazer({ inicial }: { inicial: EstadoTela }) {
  const router = useRouter();
  const [est, setEst] = useState(inicial);
  useEffect(() => setEst(inicial), [inicial]);
  useEffect(() => {
    if (!est.rodando) return;
    const t = setInterval(async () => {
      const r = await trazerEmAndamento().catch(() => undefined);
      if (r) setEst(r);
    }, 3000);
    return () => clearInterval(t);
  }, [est.rodando]);
  const pct = est.total ? Math.round((est.feitos / est.total) * 100) : 0;
  return (
    <Alert tone={est.rodando ? "gold" : est.erros.length ? "red" : "green"}>
      <div className="grid gap-2">
        <p className="inline-flex flex-wrap items-center gap-2 font-semibold">
          {est.rodando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {est.rodando
            ? `Trazendo ${est.feitos} de ${est.total} (${pct}%) · ${est.criados.length} criado(s), ${est.ligados} anúncio(s) ligado(s)`
            : `Pronto: ${est.criados.length} produto(s) criado(s), ${est.ligados} anúncio(s) ligado(s).`}
          {!est.rodando ? (
            <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-1 text-xs font-semibold text-[#0a1a33]">
              <RefreshCw className="size-3.5" /> Atualizar a lista
            </button>
          ) : null}
        </p>
        {est.rodando ? (
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {est.rodando && est.atual ? <p className="text-xs">Agora: {est.atual}</p> : null}
        {est.criados.length ? (
          <p className="text-xs">
            Criados:{" "}
            {est.criados.slice(-12).map((c, i) => (
              <span key={c.id}>
                {i ? " · " : ""}
                <Link href={`/produtos/${c.id}`} className="underline">
                  {c.nome}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {est.erros.length ? <p className="text-xs">Não deu: {est.erros.join(" | ")}</p> : null}
      </div>
    </Alert>
  );
}
