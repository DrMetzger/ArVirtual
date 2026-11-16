"use client";

import { Box, Download, ExternalLink, Heart, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { Alert, Badge, Button, buttonClass, Card, Input } from "@/components/ui";
import type { ItemPlano, ModeloAchado } from "@/db/schema";
import { cn, formatBRL } from "@/lib/utils";
import { acharModelosDoPlano, buscarDeNovo } from "./actions";

const num = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));

/** "Fazer esta semana" em cartões: cada produto com os modelos 3D achados, a licença e o botão de cadastrar. */
export function PlanoAcoes({ relatorioId, plano }: { relatorioId: number; plano: ItemPlano[] | null }) {
  const router = useRouter();
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
  return (
    <div className="grid gap-4">
      {plano.map((item, i) => (
        <ItemCard key={i} item={item} indice={i} relatorioId={relatorioId} />
      ))}
    </div>
  );
}

function ItemCard({ item, indice, relatorioId }: { item: ItemPlano; indice: number; relatorioId: number }) {
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
        {item.modelos.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {item.modelos.map((m) => (
              <Modelo key={m.link} m={m} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhum modelo encontrado com &quot;{item.busca}&quot;. Tente outro termo abaixo (em inglês acha mais).</p>
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

function Modelo({ m }: { m: ModeloAchado }) {
  return (
    <div className={cn("grid content-start gap-2 rounded-xl border p-2", m.comercial === false ? "border-red/40" : "border-border")}>
      {m.imagem ? (
        <FotoAmpliavel src={m.imagem} alt={m.titulo} className="aspect-square w-full rounded-lg bg-surface-2 object-cover" />
      ) : (
        <div className="aspect-square rounded-lg bg-surface-2" />
      )}
      <p className="line-clamp-2 text-sm font-semibold">{m.titulo}</p>
      <p className="text-[11px] text-muted">
        {m.fonte === "makerworld" ? "MakerWorld" : "Printables"}
        {m.autor ? ` · ${m.autor}` : ""}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-0.5">
          <Download className="size-3" /> {num(m.downloads)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Heart className="size-3" /> {num(m.curtidas)}
        </span>
      </p>
      <Badge tone={m.comercial === true ? "green" : m.comercial === false ? "red" : "neutral"} className="justify-self-start">
        {m.comercial === true ? "Pode vender" : m.comercial === false ? "Não pode vender" : "Licença: conferir"}
      </Badge>
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/produtos/modelo3d?link=${encodeURIComponent(m.link)}`} className={buttonClass(m.comercial === false ? "outline" : "gold", "sm")}>
          <Sparkles /> Cadastrar
        </Link>
        <a href={m.link} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
          <ExternalLink /> Ver
        </a>
      </div>
    </div>
  );
}
