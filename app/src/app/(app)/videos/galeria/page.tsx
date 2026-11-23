import { desc, eq, ne } from "drizzle-orm";
import { Clapperboard, Download, ExternalLink, Film, Save, Search, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { db } from "@/db";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { redeDoLink } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { excluirVideoGaleria, salvarVideoGaleria } from "./actions";

export const metadata: Metadata = { title: "Galeria de vídeos" };

const mb = (b: number) => `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default async function GaleriaPage({ searchParams }: { searchParams: Promise<{ q?: string; rede?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const todos = await db
    .select({ v: afiliadosVideos, produto: afiliadosProdutos.nome })
    .from(afiliadosVideos)
    .leftJoin(afiliadosProdutos, eq(afiliadosProdutos.id, afiliadosVideos.produtoId))
    .where(ne(afiliadosVideos.arquivo, ""))
    .orderBy(desc(afiliadosVideos.criadoEm));
  const comRede = todos.map((t) => ({ ...t, rede: redeDoLink(t.v.urlOrigem) }));
  const redes = [...new Set(comRede.map((t) => t.rede))].sort();
  const busca = sp.q ? semAcento(sp.q).split(/\s+/).filter(Boolean) : [];
  const lista = comRede.filter(
    (t) => (!sp.rede || t.rede === sp.rede) && busca.every((w) => semAcento(`${t.v.titulo} ${t.v.descricao} ${t.produto ?? ""}`).includes(w)),
  );
  const aqui = `/videos/galeria${sp.q || sp.rede ? `?${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}` : ""}`;

  return (
    <>
      <PageHeader
        title="Galeria de vídeos"
        description="Todos os vídeos que você converteu, com título, descrição e de onde vieram."
        actions={
          <Link href="/videos" className={buttonClass("gold")}>
            <Clapperboard /> Converter novo
          </Link>
        }
      />
      <div className="grid gap-5">
        <form className="flex flex-wrap gap-2">
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Buscar no título, descrição ou produto" className="min-w-0 basis-full sm:basis-0 sm:flex-1" />
          <Select name="rede" defaultValue={sp.rede ?? ""} className="min-w-0 flex-1 sm:w-auto sm:flex-none">
            <option value="">Todas as origens</option>
            {redes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass("outline")}>
            <Search /> Filtrar
          </button>
        </form>
        <p className="text-xs text-muted">{lista.length} vídeo(s)</p>
        {lista.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map(({ v, produto, rede }) => (
              <Card key={v.id} className="flex flex-col overflow-hidden">
                <div className="aspect-[9/12] max-h-[55vh] w-full bg-black">
                  <video src={`/api/afiliados/videos/${v.id}`} controls preload="metadata" playsInline className="size-full object-contain" />
                </div>
                <div className="grid flex-1 content-start gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge tone="blue">{rede}</Badge>
                    {v.status === "postado" ? <Badge tone="green">postado</Badge> : null}
                    <span className="text-muted">
                      {formatDate(v.criadoEm)} · {dur(v.duracaoS)} · {mb(v.tamanho)}
                    </span>
                  </div>
                  {v.urlOrigem ? (
                    <a href={v.urlOrigem} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs break-all text-gold hover:underline">
                      <ExternalLink className="size-3 shrink-0" /> Extraído de: {v.urlOrigem.replace(/^https?:\/\//, "").slice(0, 70)}
                    </a>
                  ) : null}
                  <form action={salvarVideoGaleria.bind(null, v.id, aqui)} className="grid gap-2">
                    <Input name="titulo" defaultValue={v.titulo} placeholder="Título" className="font-semibold" />
                    <Textarea name="descricao" defaultValue={v.descricao} placeholder="Descrição (legenda para postar)" rows={4} />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton size="sm" variant="outline" pendingText="Salvando...">
                        <Save /> Salvar
                      </SubmitButton>
                      <a href={`/api/afiliados/videos/${v.id}?baixar=1`} className={buttonClass("gold", "sm")}>
                        <Download /> Baixar
                      </a>
                    </div>
                  </form>
                  <form action={excluirVideoGaleria.bind(null, v.id, aqui)}>
                    <SubmitButton size="sm" variant="ghost" className="text-muted hover:text-red" pendingText="Excluindo...">
                      <Trash2 /> Excluir vídeo
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Film />} title={todos.length ? "Nenhum vídeo com esse filtro" : "Nenhum vídeo convertido ainda"} description="Converta vídeos em Ferramentas › Conversor de vídeo." />
        )}
      </div>
    </>
  );
}
