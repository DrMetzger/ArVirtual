import { desc, eq } from "drizzle-orm";
import { Download, ExternalLink, Film, RotateCw, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { redeDoLink } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { AtualizarEnquanto } from "../afiliados/[id]/enviar-video";
import { excluirVideo } from "../afiliados/actions";
import { tentarDeNovo } from "./actions";
import { FormConverter } from "./form";

export const metadata: Metadata = { title: "Conversor de vídeo" };

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [videos, produtos] = await Promise.all([
    db
      .select({ v: afiliadosVideos, produto: afiliadosProdutos.nome })
      .from(afiliadosVideos)
      .leftJoin(afiliadosProdutos, eq(afiliadosProdutos.id, afiliadosVideos.produtoId))
      .orderBy(desc(afiliadosVideos.criadoEm))
      .limit(120),
    db.select({ id: afiliadosProdutos.id, nome: afiliadosProdutos.nome }).from(afiliadosProdutos).orderBy(afiliadosProdutos.nome),
  ]);

  return (
    <>
      <PageHeader
        title="Conversor de vídeo"
        description="Cole o link de qualquer vídeo (TikTok, Instagram, YouTube, Facebook, Threads, Shopee...) e baixe em MP4 para editar e postar."
      />
      <AtualizarEnquanto ativo={videos.some(({ v }) => v.status === "baixando")} />
      <div className="grid gap-6">
        {sp.ok ? <Alert tone="green">{sp.ok}</Alert> : null}
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        <Card>
          <CardHeader title="Converter links" />
          <FormConverter produtos={produtos} />
        </Card>

        {!videos.length ? (
          <EmptyState icon={<Film />} title="Nenhum vídeo ainda" description="Cole um link acima: o vídeo aparece aqui pronto para baixar." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {videos.map(({ v, produto }) => (
              <Card key={v.id} className="flex min-w-0 flex-col overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
                  {v.arquivo ? (
                    <video src={`/api/afiliados/videos/${v.id}`} controls preload="metadata" playsInline className="size-full object-contain" />
                  ) : (
                    <div className="grid size-full place-items-center p-3 text-center text-xs text-white/70">
                      {v.status === "baixando" ? (
                        <span className="grid justify-items-center gap-2">
                          <RotateCw className="size-6 animate-spin text-gold" /> Convertendo...
                        </span>
                      ) : (
                        <span className="text-red-300">{v.erro || "Não foi possível baixar."}</span>
                      )}
                    </div>
                  )}
                  <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                    <Badge className="bg-black/60 text-white">{redeDoLink(v.urlOrigem)}</Badge>
                    {v.status === "erro" ? <Badge tone="red">Erro</Badge> : null}
                  </span>
                </div>
                <div className="grid flex-1 content-start gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{v.titulo || "Vídeo"}</p>
                  <p className="text-xs text-muted">
                    {v.arquivo ? `${dur(v.duracaoS)} · ${mb(v.tamanho)} · ` : ""}
                    {new Date(v.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  {produto && v.produtoId ? (
                    <Link href={`/afiliados/${v.produtoId}`} className="truncate text-xs text-gold hover:underline">
                      {produto}
                    </Link>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
                  {v.arquivo ? (
                    <a href={`/api/afiliados/videos/${v.id}?baixar=1`} className={buttonClass("gold", "sm", "flex-1")}>
                      <Download /> Baixar MP4
                    </a>
                  ) : v.status === "erro" ? (
                    <form action={tentarDeNovo.bind(null, v.id)} className="flex-1">
                      <button className={buttonClass("outline", "sm", "w-full")}>
                        <RotateCw /> Tentar de novo
                      </button>
                    </form>
                  ) : null}
                  {v.urlOrigem ? (
                    <a href={v.urlOrigem} target="_blank" rel="noreferrer" className={buttonClass("ghost", "icon")} title="Abrir o original">
                      <ExternalLink />
                    </a>
                  ) : null}
                  <form action={excluirVideo.bind(null, v.id)}>
                    <button className={buttonClass("ghost", "icon", "hover:text-red")} title="Excluir">
                      <Trash2 />
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
