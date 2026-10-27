import { ArrowLeft, Plus, Search, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, buttonClass, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos } from "@/db/schema";
import { buscarOfertas, ORDENS, type Oferta } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/utils";
import { adicionarOferta } from "../actions";

export const metadata: Metadata = { title: "Buscar produtos para divulgar" };

const ROTULO_ORDEM: Record<keyof typeof ORDENS, string> = {
  comissao: "Maior comissão",
  vendidos: "Mais vendidos",
  relevancia: "Relevância",
  menorPreco: "Menor preço",
  maiorPreco: "Maior preço",
};

export default async function BuscarAfiliadosPage({ searchParams }: { searchParams: Promise<{ q?: string; ordem?: string; pagina?: string; erro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const ordem = (sp.ordem && sp.ordem in ORDENS ? sp.ordem : "comissao") as keyof typeof ORDENS;
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  let ofertas: Oferta[] = [];
  let temMais = false;
  let erro = sp.erro ?? "";
  if (q) {
    try {
      ({ ofertas, temMais } = await buscarOfertas({ termo: q, ordem, pagina }));
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  const jaTenho = new Set(
    ofertas.length ? (await db.select({ itemId: afiliadosProdutos.itemId, id: afiliadosProdutos.id }).from(afiliadosProdutos)).map((p) => p.itemId) : [],
  );
  const qs = (p: number) => `/afiliados/buscar?${new URLSearchParams({ q, ordem, pagina: String(p) })}`;
  const voltar = qs(pagina);

  return (
    <>
      <PageHeader
        title="Buscar produtos"
        description="Produtos da Shopee com comissão para afiliados. Adicione os que quiser divulgar: o link de afiliado é gerado na hora."
        actions={
          <Link href="/afiliados" className={buttonClass("outline")}>
            <ArrowLeft /> Afiliados
          </Link>
        }
      />
      <div className="grid gap-6">
        <form className="flex flex-wrap gap-3">
          <Input name="q" defaultValue={q} placeholder="O que você quer divulgar? (ex.: suporte celular, organizador)" className="min-w-[240px] flex-1" autoFocus />
          <Select name="ordem" defaultValue={ordem} className="w-auto">
            {Object.entries(ROTULO_ORDEM).map(([k, r]) => (
              <option key={k} value={k}>
                {r}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass("gold")}>
            <Search /> Buscar
          </button>
        </form>
        {erro ? <Alert>{erro}</Alert> : null}

        {!q ? (
          <EmptyState icon={<Search />} title="Digite o que procura" description="Ordene por maior comissão para achar os que mais pagam." />
        ) : !ofertas.length && !erro ? (
          <EmptyState icon={<Search />} title="Nada encontrado" description="Tente outras palavras." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {ofertas.map((o) => (
              <Card key={o.itemId} className="flex flex-col overflow-hidden">
                <a href={o.linkProduto} target="_blank" rel="noreferrer" className="block aspect-square bg-surface-2">
                  {o.imagem ? <img src={o.imagem} alt="" className="size-full object-cover" /> : null}
                </a>
                <div className="grid flex-1 content-start gap-1 p-4">
                  <p className="line-clamp-2 text-sm font-semibold">{o.nome}</p>
                  <p className="truncate text-xs text-muted">{o.loja}</p>
                  <p className="text-sm">
                    <span className="font-semibold">{o.precoMax > o.precoMin ? `${formatBRL(o.precoMin)} a ${formatBRL(o.precoMax)}` : formatBRL(o.preco)}</span>
                  </p>
                  <p className="text-sm font-bold text-green">
                    Comissão {(o.comissaoTaxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {formatBRL(o.comissaoValor)}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="inline-flex items-center gap-0.5">
                      <Star className="size-3 fill-current text-gold" /> {o.avaliacao.toFixed(1)}
                    </span>
                    <span>{o.vendas.toLocaleString("pt-BR")} vendidos</span>
                  </p>
                </div>
                <form action={adicionarOferta.bind(null, voltar)} className="border-t border-border p-3">
                  <input type="hidden" name="oferta" value={JSON.stringify(o)} />
                  {jaTenho.has(o.itemId) ? (
                    <SubmitButton variant="outline" className="w-full" pendingText="Abrindo...">
                      Já na lista: abrir
                    </SubmitButton>
                  ) : (
                    <SubmitButton variant="primary" className="w-full" pendingText="Gerando link...">
                      <Plus /> Divulgar este
                    </SubmitButton>
                  )}
                </form>
              </Card>
            ))}
          </div>
        )}
        {q && (pagina > 1 || temMais) ? (
          <div className="flex justify-center gap-2">
            {pagina > 1 ? (
              <Link href={qs(pagina - 1)} className={buttonClass("outline")}>
                Anterior
              </Link>
            ) : null}
            {temMais ? (
              <Link href={qs(pagina + 1)} className={buttonClass("outline")}>
                Próxima
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
