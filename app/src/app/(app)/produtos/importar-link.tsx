"use client";

import { Bookmark, CheckCircle2, ExternalLink, Link2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { codigoBotaoCopiar } from "./botao-copiar";
import { Button, Card, CardHeader, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

type DadosPagina = { titulo: string; descricao: string; fotos: string[]; videos: string[]; preco: number; gtin: string; link: string };
type Item = { link: string; etapa: string; pct: number; detalhe?: string; erro?: string; produto?: { id: string; nome: string; avisos: string[] } };

const ETAPAS = ["Lendo o anúncio", "Convertendo fotos", "Convertendo vídeo", "Criando título e descrição", "Escolhendo o NCM", "Salvando o produto"];

/**
 * "Criar produto a partir de um link": cola um ou vários links (ML, Shopee, Magalu ou outra loja) e cada um vira um
 * produto, com barra de progresso por etapa. Um link por vez, para não sobrecarregar as APIs.
 */
export function ImportarLink() {
  const [texto, setTexto] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [rodando, setRodando] = useState(false);

  const atualizar = (i: number, p: Partial<Item>) => setItens((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function importar(i: number, link: string, dados?: DadosPagina) {
    try {
      const res = await fetch("/api/produtos/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link, dados }) });
      if (!res.ok || !res.body) {
        const e = (await res.json().catch(() => ({}))) as { erro?: string };
        return atualizar(i, { erro: e.erro ?? `Falha (${res.status})` });
      }
      const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += value;
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const l of linhas.filter(Boolean)) {
          const ev = JSON.parse(l) as { passo?: { etapa: string; pct: number; detalhe?: string }; fim?: Item["produto"]; erro?: string };
          if (ev.passo) atualizar(i, ev.passo);
          if (ev.fim) atualizar(i, { produto: ev.fim, pct: 100, etapa: "Pronto" });
          if (ev.erro) atualizar(i, { erro: ev.erro });
        }
      }
    } catch (e) {
      atualizar(i, { erro: (e as Error).message });
    }
  }

  // Veio do botão "Copiar para o ArVirtual" (dados lidos da página no navegador): cria na hora.
  const botao = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // React bloqueia link javascript: no JSX: o botão de favoritos recebe o código aqui.
    botao.current?.setAttribute("href", codigoBotaoCopiar(window.location.origin));
    const m = window.location.hash.match(/^#importar=(.+)$/);
    if (!m) return;
    history.replaceState(null, "", window.location.pathname);
    let dados: DadosPagina;
    try {
      dados = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1]!))))) as DadosPagina;
    } catch {
      return;
    }
    setItens((xs) => [...xs, { link: dados.link, etapa: "Na fila", pct: 0, detalhe: dados.titulo }]);
    setRodando(true);
    void importar(0, dados.link, dados).finally(() => setRodando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function iniciar() {
    const links = [...new Set(texto.match(/https?:\/\/[^\s<>"']+/gi) ?? [])].slice(0, 30);
    if (!links.length) return;
    const base = itens.length;
    setItens((xs) => [...xs, ...links.map((link) => ({ link, etapa: "Na fila", pct: 0 }))]);
    setTexto("");
    setRodando(true);
    for (const [k, link] of links.entries()) await importar(base + k, link);
    setRodando(false);
  }

  return (
    <Card id="importar">
      <CardHeader
        title="Criar produto a partir de um link"
        description="Cole o link do anúncio (Mercado Livre, Shopee, Magalu ou outra loja): o ERP traz fotos, vídeo, medidas e preço, a IA escreve título e descrição e escolhe o NCM. Pode colar vários, um por linha."
      />
      <div className="grid gap-3 p-4 sm:p-5">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder={"https://produto.mercadolivre.com.br/MLB-...\nhttps://shopee.com.br/...\nhttps://www.magazineluiza.com.br/.../p/..."}
        />
        <div>
          <Button type="button" variant="gold" onClick={iniciar} disabled={rodando || !/https?:\/\//.test(texto)}>
            {rodando ? <Loader2 className="animate-spin" /> : <Link2 />} Criar produto(s)
          </Button>
        </div>
        <div className="grid gap-2 rounded-xl border border-dashed border-gold/60 bg-gold/5 p-3 text-sm">
          <p className="font-semibold">Produto novo, de outro vendedor ou de qualquer loja?</p>
          <p className="text-muted">
            Os marketplaces bloqueiam o servidor de ler a página, mas o seu navegador lê. Arraste o botão abaixo para a <strong>barra de favoritos</strong> (uma vez
            só). Depois é só abrir o anúncio e clicar nele: o ERP abre já criando o produto com as fotos, vídeo, título, descrição e preço da página.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              ref={botao}
              href="#importar"
              onClick={(e) => {
                e.preventDefault();
                alert("Arraste este botão para a barra de favoritos do navegador. Depois, abra o anúncio e clique nele lá.");
              }}
              className="inline-flex cursor-grab items-center gap-2 rounded-xl bg-[#0a1a33] px-4 py-2 font-bold text-[#e6c158] shadow"
            >
              <Bookmark className="size-4" /> Copiar para o ArVirtual
            </a>
            <span className="text-xs text-muted">Barra de favoritos escondida? Ctrl+Shift+B (Chrome/Edge).</span>
          </div>
        </div>
        {itens.length ? (
          <div className="grid gap-2">
            {itens.map((it, i) => (
              <div key={`${it.link}-${i}`} className={cn("grid gap-1.5 rounded-xl border p-3", it.erro ? "border-red/40" : it.produto ? "border-green/40" : "border-border")}>
                <div className="flex items-center gap-2 text-sm">
                  {it.erro ? (
                    <XCircle className="size-4 shrink-0 text-red" />
                  ) : it.produto ? (
                    <CheckCircle2 className="size-4 shrink-0 text-green" />
                  ) : (
                    <Loader2 className={cn("size-4 shrink-0 text-gold", it.pct ? "animate-spin" : "")} />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold">{it.produto?.nome ?? it.detalhe ?? it.link}</span>
                  {it.produto ? (
                    <Link href={`/produtos/${it.produto.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-gold hover:underline">
                      Abrir produto <ExternalLink className="size-3" />
                    </Link>
                  ) : null}
                </div>
                {it.erro ? (
                  <p className="text-xs text-red">{it.erro}</p>
                ) : (
                  <>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full transition-all duration-500", it.produto ? "bg-green" : "bg-gold")} style={{ width: `${it.pct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                      {ETAPAS.map((e) => {
                        const atual = ETAPAS.indexOf(it.etapa);
                        const k = ETAPAS.indexOf(e);
                        return (
                          <span key={e} className={cn(it.produto || k < atual ? "text-green" : k === atual ? "font-semibold text-gold" : "text-muted")}>
                            {it.produto || k < atual ? "✓ " : ""}
                            {e}
                            {k === atual && it.detalhe && it.etapa !== "Lendo o anúncio" ? ` (${it.detalhe})` : ""}
                          </span>
                        );
                      })}
                    </div>
                    {it.produto?.avisos.length ? <p className="text-xs text-muted">{it.produto.avisos.join(" ")}</p> : null}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
