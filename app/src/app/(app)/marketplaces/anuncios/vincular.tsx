"use client";

import { CheckCircle2, ExternalLink, Loader2, Package, Search, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BuscaSelect, filtrarOpcoes, type Opcao } from "@/components/busca-select";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import type { Marketplace } from "@/db/schema";
import type { AnuncioExterno } from "@/lib/marketplaces/types";
import { cn, formatBRL } from "@/lib/utils";
import { vincularAnuncio } from "../actions";

type Conta = { id: number; nome: string; marketplace: Marketplace; marketplaceNome: string };
type ProdutoOpcao = { id: string; sku: string; titulo: string; ativo: boolean };

const chave = (s: string) => s.trim().toLowerCase();

export function VincularAnuncios({
  contaId,
  contas,
  produtos,
  vinculos: iniciais,
}: {
  contaId: number;
  contas: Conta[];
  produtos: ProdutoOpcao[];
  /** idExterno do anúncio → id do produto já vinculado. */
  vinculos: Record<string, string>;
}) {
  const [lista, setLista] = useState<AnuncioExterno[] | null>(null);
  const [erro, setErro] = useState("");
  const [vinculos, setVinculos] = useState(iniciais);
  const [salvando, setSalvando] = useState<string[]>([]);
  const [termo, setTermo] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem" | "com">("sem");

  useEffect(() => {
    fetch(`/api/anuncios-externos?conta=${contaId}`)
      .then(async (r) => {
        const j = (await r.json()) as { anuncios?: AnuncioExterno[]; erro?: string };
        if (j.erro) throw new Error(j.erro);
        setLista(j.anuncios ?? []);
      })
      .catch((e: Error) => {
        setErro(e.message);
        setLista([]);
      });
  }, [contaId]);

  const opcoes: Opcao<ProdutoOpcao>[] = useMemo(
    () => produtos.map((p) => ({ id: p.id, titulo: p.titulo, detalhe: `${p.sku}${p.ativo ? "" : " · inativo"}`, dados: p })),
    [produtos],
  );
  const porId = useMemo(() => new Map(opcoes.map((o) => [o.id, o])), [opcoes]);
  const porSku = useMemo(() => new Map(produtos.map((p) => [chave(p.sku), p.id])), [produtos]);
  const sugestao = (a: AnuncioExterno) => (a.sku ? porSku.get(chave(a.sku)) : undefined);

  const visiveis = (lista ?? []).filter(
    (a) =>
      (filtro === "todos" || (filtro === "com") === Boolean(vinculos[a.idExterno])) &&
      filtrarOpcoes([{ id: a.idExterno, titulo: a.titulo, detalhe: `${a.sku} ${a.idExterno}` }], termo).length > 0,
  );
  const sugeridos = (lista ?? []).filter((a) => !vinculos[a.idExterno] && sugestao(a));
  const total = lista?.length ?? 0;
  const vinculados = (lista ?? []).filter((a) => vinculos[a.idExterno]).length;

  async function vincular(a: AnuncioExterno, produtoId: string | null) {
    setSalvando((s) => [...s, a.idExterno]);
    const r = await vincularAnuncio(contaId, { idExterno: a.idExterno, link: a.link, preco: a.preco }, produtoId).catch((e: Error) => ({ erro: e.message }));
    setSalvando((s) => s.filter((x) => x !== a.idExterno));
    if (r.erro) return setErro(r.erro);
    setVinculos((v) => {
      const n = { ...v };
      if (produtoId) n[a.idExterno] = produtoId;
      else delete n[a.idExterno];
      return n;
    });
  }

  async function vincularSugeridos() {
    for (const a of sugeridos) await vincular(a, sugestao(a)!);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {contas.map((c) => (
          <Link
            key={c.id}
            href={`/marketplaces/anuncios?conta=${c.id}`}
            className={cn(
              "flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
              c.id === contaId ? "border-gold bg-gold/10" : "border-border hover:border-gold/60",
            )}
          >
            <MarcaIcone canal={c.marketplace} />
            {c.marketplaceNome}
            <span className="min-w-0 truncate font-normal text-muted">{c.nome}</span>
          </Link>
        ))}
      </div>

      {erro ? <Alert>{erro}</Alert> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por título, SKU ou código do anúncio" className="pl-9" />
          </div>
          <Select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="w-auto">
            <option value="sem">Sem vínculo</option>
            <option value="com">Vinculados</option>
            <option value="todos">Todos</option>
          </Select>
          {sugeridos.length ? (
            <Button type="button" variant="gold" onClick={vincularSugeridos} disabled={salvando.length > 0}>
              <Wand2 /> Vincular {sugeridos.length} pelo SKU
            </Button>
          ) : null}
        </div>
        {lista ? (
          <p className="border-b border-border px-4 py-2 text-xs text-muted">
            {total} anúncio(s) na conta · {vinculados} vinculado(s) · {total - vinculados} sem vínculo
          </p>
        ) : null}

        {!lista ? (
          <p className="flex items-center gap-2 p-6 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Buscando os anúncios no marketplace...
          </p>
        ) : !visiveis.length ? (
          <p className="p-6 text-sm text-muted">
            {total ? (filtro === "sem" ? "Todos os anúncios já estão vinculados." : "Nenhum anúncio encontrado.") : "Nenhum anúncio nesta conta."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {visiveis.map((a) => {
              const atual = vinculos[a.idExterno];
              const sug = !atual ? sugestao(a) : undefined;
              const ocupado = salvando.includes(a.idExterno);
              return (
                <div key={a.idExterno} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-[2] basis-60 items-center gap-3">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white">
                      {a.imagem ? <img src={a.imagem} alt="" className="size-full object-cover" /> : <Package className="size-6 text-muted" />}
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold">{a.titulo}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span className="font-mono">{a.idExterno}</span>
                        {a.sku && a.sku !== a.idExterno ? <span>SKU {a.sku}</span> : null}
                        {a.preco != null ? <span>{formatBRL(a.preco)}</span> : null}
                        <Badge tone={a.status === "ativo" ? "green" : "neutral"}>{a.status}</Badge>
                        <a href={a.link} target="_blank" rel="noreferrer" className="hover:text-gold" title="Abrir anúncio">
                          <ExternalLink className="size-3.5" />
                        </a>
                      </p>
                    </div>
                  </div>
                  <div className="grid min-w-0 flex-1 basis-64 gap-1">
                    <div className="flex items-center gap-2">
                      <BuscaSelect
                        valor={atual ? (porId.get(atual) ?? null) : null}
                        onChange={(o) => vincular(a, o?.id ?? null)}
                        opcoes={opcoes}
                        placeholder="Escolha o produto do cadastro"
                        disabled={ocupado}
                        className="flex-1"
                      />
                      {ocupado ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
                      ) : atual ? (
                        <CheckCircle2 className="size-4 shrink-0 text-green" />
                      ) : null}
                    </div>
                    {sug ? (
                      <button type="button" onClick={() => vincular(a, sug)} className="w-fit text-left text-xs text-gold hover:underline" disabled={ocupado}>
                        Mesmo SKU: {porId.get(sug)?.titulo} — vincular
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
