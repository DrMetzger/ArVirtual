import { desc, eq } from "drizzle-orm";
import { ArrowLeft, Download, ExternalLink, RefreshCw, Star, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copiavel } from "@/components/copiavel";
import { Alert, Badge, buttonClass, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosComissoes, afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { STATUS_COMISSAO } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { formatBRL, formatDate } from "@/lib/utils";
import { atualizarOferta, atualizarProduto, atualizarVideo, baixarVideoDoLink, excluirProduto, excluirVideo } from "../actions";
import { ORIGEM_VIDEO, STATUS_PRODUTO, STATUS_VIDEO } from "../status";
import { AtualizarEnquanto, EnviarVideo } from "./enviar-video";

export const metadata: Metadata = { title: "Produto de afiliado" };

const duracao = (s: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

export default async function AfiliadoProdutoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const p = await db.query.afiliadosProdutos.findFirst({ where: eq(afiliadosProdutos.id, Number(id)) });
  if (!p) notFound();
  const [videos, comissoes] = await Promise.all([
    db.select().from(afiliadosVideos).where(eq(afiliadosVideos.produtoId, p.id)).orderBy(desc(afiliadosVideos.criadoEm)),
    db.select().from(afiliadosComissoes).where(eq(afiliadosComissoes.itemId, p.itemId)).orderBy(desc(afiliadosComissoes.compraEm)).limit(50),
  ]);
  const validas = comissoes.filter((c) => c.status !== "CANCELLED");

  return (
    <>
      <AtualizarEnquanto ativo={videos.some((v) => v.status === "baixando")} />
      <PageHeader
        title={p.nome}
        description={p.loja}
        actions={
          <>
            <Link href="/afiliados" className={buttonClass("outline")}>
              <ArrowLeft /> Afiliados
            </Link>
            <form action={excluirProduto.bind(null, p.id)}>
              <button type="submit" className={buttonClass("outline", "md", "hover:border-red hover:text-red")}>
                <Trash2 /> Remover
              </button>
            </form>
          </>
        }
      />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card>
            <div className="flex flex-wrap gap-4 p-5">
              {p.imagem ? <img src={p.imagem} alt="" className="size-32 shrink-0 rounded-xl object-cover" /> : null}
              <div className="grid min-w-[180px] flex-1 content-start gap-1 text-sm">
                <p className="text-lg font-bold">{formatBRL(p.preco)}</p>
                <p className="font-bold text-green">
                  Comissão {(p.comissaoTaxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% · {formatBRL(p.comissaoValor)} por venda
                </p>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Star className="size-3 fill-current text-gold" /> {p.avaliacao.toFixed(1)} · {p.vendas.toLocaleString("pt-BR")} vendidos
                </p>
                <p className="text-xs text-muted">Atualizado {formatDate(p.atualizadoEm)}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <a href={p.linkProduto} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm")}>
                    <ExternalLink /> Ver na Shopee
                  </a>
                  <form action={atualizarOferta.bind(null, p.id)}>
                    <SubmitButton variant="outline" size="sm" pendingText="Atualizando...">
                      <RefreshCw /> Atualizar comissão
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
            <div className="grid gap-4 border-t border-border p-5">
              {p.linkAfiliado ? <Copiavel rotulo="Seu link de afiliado" texto={p.linkAfiliado} /> : <Alert tone="gold">Link ainda não gerado: salve abaixo para gerar.</Alert>}
              <form action={atualizarProduto.bind(null, p.id)} className="grid gap-3 sm:grid-cols-2">
                <Field label="Situação">
                  <Select name="status" defaultValue={p.status}>
                    {Object.entries(STATUS_PRODUTO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sub ID do link" hint="Ex.: tiktok, insta, video1. Aparece nas comissões para saber de onde veio a venda.">
                  <Input name="subId" defaultValue={p.subId} placeholder="padrão das Configurações" maxLength={50} />
                </Field>
                <Field label="Anotações" className="sm:col-span-2">
                  <Textarea name="observacao" defaultValue={p.observacao} rows={3} placeholder="Ideias de gancho, cupom, onde postou..." />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton pendingText="Salvando...">Salvar</SubmitButton>
                </div>
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Vídeos"
              description="Biblioteca para editar e postar. Cole o link do vídeo (TikTok, Instagram, YouTube...) ou envie do computador."
            />
            <div className="grid gap-4 p-5">
              <form action={baixarVideoDoLink.bind(null, p.id)} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                <Field label="Link do vídeo" className="sm:col-span-2">
                  <Input name="url" type="url" placeholder="https://www.tiktok.com/@.../video/..." required />
                </Field>
                <Field label="De onde vem">
                  <Select name="origem" defaultValue="proprio">
                    {Object.entries(ORIGEM_VIDEO).map(([k, r]) => (
                      <option key={k} value={k}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Autorização (se não for seu)">
                  <Input name="autorizacao" placeholder="Ex.: @criador autorizou por DM em 27/10" />
                </Field>
                <div className="sm:col-span-2">
                  <SubmitButton variant="gold" pendingText="Enviando...">
                    <Download /> Baixar vídeo
                  </SubmitButton>
                </div>
              </form>
              <EnviarVideo produtoId={p.id} />

              {videos.length === 0 ? <p className="text-sm text-muted">Nenhum vídeo ainda.</p> : null}
              {videos.map((v) => {
                const st = STATUS_VIDEO[v.status];
                return (
                  <div key={v.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="overflow-hidden rounded-lg bg-black">
                      {v.arquivo ? (
                        <video src={`/api/afiliados/videos/${v.id}`} controls preload="metadata" className="aspect-[9/16] w-full object-contain" />
                      ) : (
                        <div className="grid aspect-[9/16] place-items-center p-3 text-center text-xs text-white/70">{v.status === "baixando" ? "Baixando…" : "Sem arquivo"}</div>
                      )}
                    </div>
                    <form action={atualizarVideo.bind(null, v.id)} className="grid content-start gap-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tom}>{st.rotulo}</Badge>
                        <span className="text-xs text-muted">
                          {[duracao(v.duracaoS), v.tamanho ? mb(v.tamanho) : "", formatDate(v.criadoEm)].filter(Boolean).join(" · ")}
                        </span>
                        {v.urlOrigem ? (
                          <a href={v.urlOrigem} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">
                            origem
                          </a>
                        ) : null}
                      </div>
                      {v.status === "erro" ? <Alert>{v.erro || "Falha ao baixar."}</Alert> : null}
                      <Input name="titulo" defaultValue={v.titulo} placeholder="Título" className="h-9" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Select name="origem" defaultValue={v.origem} className="h-9 text-sm" aria-label="Origem">
                          {Object.entries(ORIGEM_VIDEO).map(([k, r]) => (
                            <option key={k} value={k}>
                              {r}
                            </option>
                          ))}
                        </Select>
                        <Select name="status" defaultValue={v.status} className="h-9 text-sm" aria-label="Situação" disabled={v.status === "baixando" || v.status === "erro"}>
                          <option value="bruto">Bruto</option>
                          <option value="editado">Editado</option>
                          <option value="postado">Postado</option>
                        </Select>
                      </div>
                      <Input name="autorizacao" defaultValue={v.autorizacao} placeholder="Autorização (quem, quando, onde)" className="h-9" />
                      <Input name="observacao" defaultValue={v.observacao} placeholder="Anotações (onde postou, ideias de edição...)" className="h-9" />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton variant="outline" size="sm" pendingText="Salvando...">
                          Salvar
                        </SubmitButton>
                        {v.arquivo ? (
                          <a href={`/api/afiliados/videos/${v.id}?baixar=1`} className={buttonClass("outline", "sm")}>
                            <Download /> Baixar
                          </a>
                        ) : null}
                        <button formAction={excluirVideo.bind(null, v.id)} className={buttonClass("ghost", "sm", "hover:text-red")}>
                          <Trash2 /> Apagar
                        </button>
                      </div>
                    </form>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Vendas deste produto"
            description={`${validas.length} item(ns) vendidos pelos seus links · ${formatBRL(validas.reduce((s, c) => s + c.comissao, 0))} de comissão`}
          />
          {comissoes.length === 0 ? (
            <p className="p-5 text-sm text-muted">Nenhuma venda ainda. As comissões entram pela sincronização em Afiliados › Comissões.</p>
          ) : (
            <div className="divide-y divide-border">
              {comissoes.map((c) => {
                const st = STATUS_COMISSAO[c.status] ?? { rotulo: c.status, tom: "neutral" as const };
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="text-muted">{c.compraEm ? formatDate(c.compraEm) : "—"}</span>
                    <span className="font-mono text-xs">{c.orderId}</span>
                    <Badge tone={st.tom}>{st.rotulo}</Badge>
                    {c.subId ? <span className="text-xs text-muted">sub ID {c.subId}</span> : null}
                    <span className="ml-auto font-semibold text-green">{formatBRL(c.comissao)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
