import { ArrowLeft, Flame, Plus, Search, SlidersHorizontal, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos } from "@/db/schema";
import { buscarOfertas, ORDENS, type Oferta } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { formatBRL, parseDecimal } from "@/lib/utils";
import { adicionarOferta } from "../actions";

export const metadata: Metadata = { title: "Buscar produtos para divulgar" };

const ROTULO_ORDEM: Record<keyof typeof ORDENS, string> = {
  comissao: "Maior comissão",
  vendidos: "Mais vendidos",
  relevancia: "Relevância",
  menorPreco: "Menor preço",
  maiorPreco: "Maior preço",
};

type Params = {
  q?: string;
  ordem?: string;
  pagina?: string;
  erro?: string;
  comissao?: string;
  vendas?: string;
  precoMin?: string;
  precoMax?: string;
  nota?: string;
  extra?: string;
  destaque?: string;
  mall?: string;
};

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export default async function BuscarAfiliadosPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const ordem = (sp.ordem && sp.ordem in ORDENS ? sp.ordem : "comissao") as keyof typeof ORDENS;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  // Filtros que a Shopee não aplica na busca: o ERP lê até 3 páginas dela e filtra aqui.
  const f = {
    comissao: parseDecimal(sp.comissao ?? "") / 100,
    vendas: Math.max(0, Number(sp.vendas) || 0),
    precoMin: parseDecimal(sp.precoMin ?? ""),
    precoMax: parseDecimal(sp.precoMax ?? ""),
    nota: parseDecimal(sp.nota ?? ""),
    extra: sp.extra === "1",
    destaque: sp.destaque === "1",
    mall: sp.mall === "1",
  };
  const filtrando = Boolean(f.comissao || f.vendas || f.precoMin || f.precoMax || f.nota || f.mall);

  let lidas: Oferta[] = [];
  let temMais = false;
  let erro = sp.erro ?? "";
  // Sem termo: a lista "em alta" da própria Shopee (o que mais está vendendo pelos afiliados agora).
  const emAlta = !q;
  {
    try {
      const paginasApi = filtrando ? 3 : 1;
      for (let i = 0; i < paginasApi; i++) {
        const pag = (pagina - 1) * paginasApi + i + 1;
        const r = emAlta
          ? await buscarOfertas({ lista: 2, pagina: pag })
          : await buscarOfertas({ termo: q, ordem, pagina: pag, extraVendedor: f.extra, vendedorDestaque: f.destaque });
        lidas.push(...r.ofertas);
        temMais = r.temMais;
        if (!r.temMais) break;
      }
    } catch (e) {
      erro = (e as Error).message;
    }
  }
  const ofertas = lidas.filter(
    (o) =>
      o.comissaoTaxa >= f.comissao &&
      o.vendas >= f.vendas &&
      (!f.precoMin || o.precoMin >= f.precoMin) &&
      (!f.precoMax || o.precoMin <= f.precoMax) &&
      o.avaliacao >= f.nota &&
      (!f.mall || o.tiposLoja.includes("Shopee Mall")),
  );
  const jaTenho = new Set(ofertas.length ? (await db.select({ itemId: afiliadosProdutos.itemId }).from(afiliadosProdutos)).map((p) => p.itemId) : []);
  const qs = (p: number) => `/afiliados/buscar?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "erro" && k !== "pagina")) as Record<string, string>), pagina: String(p) })}`;
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
        <Card>
          <form className="grid gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap gap-3">
              <Input name="q" defaultValue={q} placeholder="O que você quer divulgar? (vazio = em alta entre afiliados)" className="min-w-0 flex-1 basis-60" />
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
            </div>
            <details open={filtrando || f.extra || f.destaque} className="rounded-xl border border-border p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <SlidersHorizontal className="size-4 text-gold" /> Filtros
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="Comissão mínima (%)">
                  <Input name="comissao" defaultValue={sp.comissao} inputMode="decimal" placeholder="ex.: 15" />
                </Field>
                <Field label="Vendas mínimas">
                  <Input name="vendas" defaultValue={sp.vendas} inputMode="numeric" placeholder="ex.: 100" />
                </Field>
                <Field label="Preço de (R$)">
                  <Input name="precoMin" defaultValue={sp.precoMin} inputMode="decimal" placeholder="0,00" />
                </Field>
                <Field label="Preço até (R$)">
                  <Input name="precoMax" defaultValue={sp.precoMax} inputMode="decimal" placeholder="0,00" />
                </Field>
                <Field label="Avaliação mínima">
                  <Select name="nota" defaultValue={sp.nota ?? ""}>
                    <option value="">Qualquer</option>
                    <option value="4">4 ★ ou mais</option>
                    <option value="4.5">4,5 ★ ou mais</option>
                    <option value="4.8">4,8 ★ ou mais</option>
                  </Select>
                </Field>
                <div className="grid content-end gap-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="extra" value="1" defaultChecked={f.extra} className="size-4 accent-[var(--gold)]" />
                    Comissão extra do vendedor
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="destaque" value="1" defaultChecked={f.destaque} className="size-4 accent-[var(--gold)]" />
                    Vendedor destaque
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="mall" value="1" defaultChecked={f.mall} className="size-4 accent-[var(--gold)]" />
                    Só Shopee Mall
                  </label>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                A Shopee não informa quantos afiliados divulgam cada produto. Para achar boas oportunidades, combine comissão alta, vendas e avaliação; a
                “comissão extra do vendedor” é paga a mais pela loja (campanhas AMS).
              </p>
            </details>
          </form>
        </Card>
        {erro ? <Alert>{erro}</Alert> : null}

        {emAlta && ofertas.length ? (
          <div className="flex items-center gap-2">
            <Flame className="size-5 text-red" />
            <p className="font-display text-lg font-bold">Em alta entre afiliados</p>
            <span className="text-sm text-muted">o que mais está vendendo pelos links de afiliado na Shopee agora</span>
          </div>
        ) : null}
        {!ofertas.length && !erro ? (
          <EmptyState
            icon={<Search />}
            title="Nada encontrado"
            description={filtrando && lidas.length ? `${lidas.length} produto(s) encontrados, nenhum dentro dos filtros. Afrouxe os filtros ou vá para a próxima página.` : "Tente outras palavras."}
          />
        ) : (
          <>
            {filtrando ? (
              <p className="text-sm text-muted">
                {ofertas.length} de {lidas.length} produto(s) desta página dentro dos filtros.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {ofertas.map((o) => (
                <Card key={o.itemId} className="flex min-w-0 flex-col overflow-hidden">
                  <a href={o.linkProduto} target="_blank" rel="noreferrer" className="relative block aspect-square bg-surface-2">
                    {o.imagem ? <img src={o.imagem} alt="" className="size-full object-cover" /> : null}
                    <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                      {o.desconto ? <Badge tone="red">-{o.desconto}%</Badge> : null}
                      {o.tiposLoja.map((t) => (
                        <Badge key={t} tone="blue">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  </a>
                  <div className="grid flex-1 content-start gap-1 p-3 sm:p-4">
                    <p className="line-clamp-2 text-sm font-semibold">{o.nome}</p>
                    <p className="truncate text-xs text-muted">{o.loja}</p>
                    <p className="text-sm font-semibold">{o.precoMax > o.precoMin ? `${formatBRL(o.precoMin)} a ${formatBRL(o.precoMax)}` : formatBRL(o.preco)}</p>
                    <p className="text-sm font-bold text-green">
                      {pct(o.comissaoTaxa)} · {formatBRL(o.comissaoValor)}
                    </p>
                    {o.comissaoVendedor ? <p className="text-xs font-semibold text-gold">+{pct(o.comissaoVendedor)} extra do vendedor</p> : null}
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="size-3 fill-current text-gold" /> {o.avaliacao.toFixed(1)}
                      </span>
                      <span>{o.vendas.toLocaleString("pt-BR")} vendidos</span>
                      {o.ofertaAte ? <span>até {new Date(o.ofertaAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span> : null}
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
                        <Plus /> Divulgar
                      </SubmitButton>
                    )}
                  </form>
                </Card>
              ))}
            </div>
          </>
        )}
        {pagina > 1 || temMais ? (
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
