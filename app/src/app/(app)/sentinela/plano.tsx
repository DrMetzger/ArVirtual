"use client";

import { Box, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotaoCadastrarTudo, CartaoModelo, ProgressoCadastro } from "@/components/modelos-achados";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import type { ItemPlano } from "@/db/schema";
import type { EstadoCadastro } from "@/lib/cadastro-modelos";
import { formatBRL } from "@/lib/utils";
import { acharModelosDoPlano, buscarDeNovo } from "./actions";

/** "Fazer esta semana" em cartões: cada produto com os modelos 3D achados, a licença e o botão de cadastrar. */
export function PlanoAcoes({ relatorioId, plano, andamento }: { relatorioId: number; plano: ItemPlano[] | null; andamento: EstadoCadastro | null }) {
  const router = useRouter();
  const [vigiar, setVigiar] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();
  if (!plano?.length) {
    return (
      <Card className="p-5">
        <div className="grid gap-2">
          <p className="text-sm">Este plano ainda é só texto. Separe as sugestões e ache o modelo 3D de cada uma nos sites (MakerWorld e Printables):</p>
          <Button
            type="button"
            variant="gold"
            className="justify-self-start"
            disabled={rodando}
            onClick={() =>
              iniciar(async () => {
                const r = await acharModelosDoPlano(relatorioId);
                if (r.erro) setErro(r.erro);
                else router.refresh();
              })
            }
          >
            <Box /> {rodando ? "Procurando os modelos..." : "Achar os modelos 3D deste plano"}
          </Button>
          {erro ? <Alert>{erro}</Alert> : null}
        </div>
      </Card>
    );
  }
  const todos = plano.flatMap((i) => i.modelos);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
        <p className="text-sm text-muted">
          Cadastra como produto todos os modelos do plano que a licença deixa vender (os já cadastrados são pulados). Anunciar continua com você, no produto.
        </p>
        <BotaoCadastrarTudo modelos={todos} aoIniciar={() => setVigiar((v) => v + 1)} />
      </div>
      <ProgressoCadastro inicial={andamento} vigiar={vigiar} />
      {plano.map((item, i) => (
        <ItemCard key={i} item={item} indice={i} relatorioId={relatorioId} aoIniciar={() => setVigiar((v) => v + 1)} />
      ))}
    </div>
  );
}

function ItemCard({ item, indice, relatorioId, aoIniciar }: { item: ItemPlano; indice: number; relatorioId: number; aoIniciar: () => void }) {
  const router = useRouter();
  const [termo, setTermo] = useState(item.busca);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();
  const vendaveis = item.modelos.filter((m) => m.comercial !== false).length;
  return (
    <Card>
      <div className="grid gap-1 border-b border-border p-5">
        <p className="flex flex-wrap items-start gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gold text-sm font-extrabold text-[#0a1a33]">{indice + 1}</span>
          <span className="min-w-0 flex-1 text-base font-bold">{item.produto}</span>
        </p>
        <p className="flex flex-wrap gap-2 pl-9 text-xs">
          {item.preco ? <Badge tone="green">{formatBRL(item.preco)}</Badge> : null}
          {item.marketplace ? <Badge tone="blue">{item.marketplace} primeiro</Badge> : null}
        </p>
        {item.porque ? <p className="pl-9 text-sm text-muted">{item.porque}</p> : null}
      </div>
      <div className="grid gap-3 p-5">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Modelos 3D encontrados ({item.modelos.length}){item.modelos.length ? ` · ${vendaveis} com licença que deixa vender ou a conferir` : ""}
        </p>
        {item.modelos.some((m) => m.comercial === true) ? <BotaoCadastrarTudo modelos={item.modelos} rotulo="Cadastrar os deste item" aoIniciar={aoIniciar} /> : null}
        {item.modelos.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {item.modelos.map((m) => (
              <CartaoModelo key={m.link} m={m} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhum modelo encontrado com &quot;{item.busca}&quot;. Tente outras palavras abaixo.</p>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              setErro(null);
              const r = await buscarDeNovo(relatorioId, indice, termo);
              if (r.erro) setErro(r.erro);
              router.refresh();
            });
          }}
        >
          <Input value={termo} onChange={(e) => setTermo(e.target.value)} aria-label="Procurar outro modelo" className="min-w-0 flex-1" />
          <Button type="submit" variant="outline" disabled={buscando}>
            <Search /> {buscando ? "Procurando..." : "Procurar"}
          </Button>
        </form>
        {erro ? <p className="text-xs text-red">{erro}</p> : null}
      </div>
    </Card>
  );
}
