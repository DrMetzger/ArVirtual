"use client";

import { Loader2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { excluirPesquisa, limparHistorico } from "./actions";

type Pesquisa = { id: number; termo: string; quando: string };

/** Histórico de pesquisas: cada uma com o X para apagar, e o botão de limpar tudo. */
export function HistoricoPesquisas({ pesquisas, atualId }: { pesquisas: Pesquisa[]; atualId: number | null }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const apagar = (p: Pesquisa) => {
    if (!window.confirm(`Apagar a pesquisa “${p.termo}” do histórico? Os produtos já cadastrados continuam.`)) return;
    iniciar(async () => {
      await excluirPesquisa(p.id);
      router.replace(p.id === atualId ? "/modelos3d" : `/modelos3d${atualId ? `?p=${atualId}` : ""}`);
      router.refresh();
    });
  };
  const limpar = () => {
    if (!window.confirm("Limpar todo o histórico de pesquisas? Os produtos já cadastrados continuam.")) return;
    iniciar(async () => {
      await limparHistorico();
      router.replace("/modelos3d");
      router.refresh();
    });
  };
  return (
    <div className={cn("mt-4 flex flex-wrap items-center gap-2", pendente && "opacity-60")}>
      {pesquisas.map((x) => (
        <span
          key={x.id}
          className={cn(
            "inline-flex max-w-full items-center rounded-full border text-xs font-semibold",
            atualId === x.id ? "border-primary bg-primary text-primary-fg" : "border-border text-muted",
          )}
        >
          <Link href={`/modelos3d?p=${x.id}`} title={x.quando} className="min-w-0 truncate py-1.5 pr-1 pl-3 hover:text-foreground">
            {x.termo}
          </Link>
          <button
            type="button"
            onClick={() => apagar(x)}
            disabled={pendente}
            aria-label={`Apagar a pesquisa ${x.termo}`}
            title="Apagar do histórico"
            className="mr-1 rounded-full p-1 hover:bg-red-500/20 hover:text-red-400"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={limpar}
        disabled={pendente}
        className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10"
      >
        {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Limpar histórico
      </button>
    </div>
  );
}
