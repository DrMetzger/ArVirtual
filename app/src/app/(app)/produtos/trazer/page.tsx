import { ArrowLeft, Download, Link2, Loader2, PackagePlus, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { MarcaIcone } from "@/components/marca";
import { Alert, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { estadoTrazer, gruposParaTrazer } from "@/lib/trazer-anuncios";
import { formatBRL } from "@/lib/utils";
import { AtualizarSozinho } from "../../sentinela/atualizar";
import { relerAnuncios, trazerEmAndamento, trazerSelecionados } from "./actions";

export const metadata: Metadata = { title: "Trazer anúncios dos marketplaces" };

export default async function TrazerPage({ searchParams }: { searchParams: Promise<{ erro?: string; lendo?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [grupos, est] = await Promise.all([gruposParaTrazer(), Promise.resolve(estadoTrazer())]);
  const rodando = Boolean(est && !est.fim);
  const novos = grupos.filter((g) => !g.existente);
  const ligar = grupos.filter((g) => g.existente);

  return (
    <>
      <AtualizarSozinho ativo={rodando} verificar={trazerEmAndamento} />
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Produtos
      </Link>
      <PageHeader
        title="Trazer anúncios dos marketplaces"
        description="Anúncios das suas contas que ainda não estão no cadastro. O mesmo produto em várias plataformas vira um produto só; o que já existe no cadastro é só ligado."
        actions={
          <form action={relerAnuncios}>
            <SubmitButton variant="outline" pendingText="Lendo...">
              <RefreshCw /> Ler as plataformas de novo
            </SubmitButton>
          </form>
        }
      />
      <div className="grid gap-5">
        {sp.erro ? <Alert>{sp.erro}</Alert> : null}
        {sp.lendo ? <Alert tone="blue">Lendo todos os anúncios das plataformas em segundo plano. Em alguns minutos, recarregue esta página.</Alert> : null}
        {est ? (
          <Alert tone={rodando ? "gold" : est.erros.length ? "red" : "green"}>
            <div className="grid gap-1">
              <p className="inline-flex items-center gap-2 font-semibold">
                {rodando ? <Loader2 className="size-4 animate-spin" /> : null}
                {rodando ? `Trazendo ${est.feitos} de ${est.total}…` : `Pronto: ${est.criados.length} produto(s) criado(s), ${est.ligados} anúncio(s) ligado(s).`}
              </p>
              {rodando && est.atual ? <p className="text-xs">Agora: {est.atual}</p> : null}
              {est.criados.length ? (
                <p className="text-xs">
                  Criados:{" "}
                  {est.criados.slice(-12).map((c, i) => (
                    <span key={c.id}>
                      {i ? " · " : ""}
                      <Link href={`/produtos/${c.id}`} className="underline">
                        {c.nome}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
              {est.erros.length ? <p className="text-xs">Não deu: {est.erros.join(" | ")}</p> : null}
            </div>
          </Alert>
        ) : null}

        {!grupos.length ? (
          <EmptyState icon={<PackagePlus />} title="Tudo no cadastro" description="Todos os anúncios das plataformas já estão ligados a produtos do ERP." />
        ) : (
          <form action={trazerSelecionados} className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                <b className="text-foreground">{novos.length}</b> produto(s) novo(s) para criar e <b className="text-foreground">{ligar.length}</b> anúncio(s) que só precisam ser ligados.
                Cada produto novo leva ~30 s (fotos, vídeo, descrição e NCM).
              </p>
              <SubmitButton variant="gold" pendingText="Começando..." disabled={rodando}>
                <Download /> Trazer os marcados
              </SubmitButton>
            </div>
            {[
              ["Novos no cadastro", novos, "Cria o produto com fotos, vídeo, descrição, medidas e NCM a partir do anúncio mais completo do grupo."],
              ["Já existem no cadastro: só ligar", ligar, "Achei um produto parecido no cadastro: os anúncios são ligados a ele (nada é criado)."],
            ].map(([titulo, lista, desc]) =>
              (lista as typeof grupos).length ? (
                <Card key={titulo as string}>
                  <CardHeader title={titulo as string} description={desc as string} />
                  <div className="divide-y divide-border">
                    {(lista as typeof grupos).map((g) => (
                      <label key={g.chave} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-2">
                        <input type="checkbox" name="g" value={g.chave} defaultChecked className="mt-1 size-5 shrink-0" />
                        <FotoAmpliavel src={g.principal.imagem} alt={g.principal.titulo} className="size-14" />
                        <div className="grid min-w-0 flex-1 gap-1">
                          <p className="line-clamp-2 text-sm font-semibold">{g.principal.titulo}</p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {g.anuncios.map((a) => (
                              <a key={`${a.contaId}-${a.idExterno}`} href={a.link || undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-2 pl-0.5">
                                <MarcaIcone canal={a.marketplace} className="size-4" /> {formatBRL(a.preco)}
                              </a>
                            ))}
                            {g.existente ? (
                              <Badge tone="blue">
                                <Link2 className="size-3" /> ligar a: {g.existente.nome.slice(0, 40)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </Card>
              ) : null,
            )}
          </form>
        )}
      </div>
    </>
  );
}
