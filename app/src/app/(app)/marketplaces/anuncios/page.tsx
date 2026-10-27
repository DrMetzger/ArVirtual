import { and, asc, eq, isNotNull } from "drizzle-orm";
import { ArrowLeft, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { MARKETPLACE_INFO } from "@/lib/marketplaces";
import { VincularAnuncios } from "./vincular";

export const metadata: Metadata = { title: "Vincular anúncios" };

export default async function AnunciosExistentesPage({ searchParams }: { searchParams: Promise<{ conta?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [contas, lista, vinculos] = await Promise.all([
    db.select().from(contasMarketplace).orderBy(asc(contasMarketplace.marketplace), asc(contasMarketplace.nome)),
    db
      .select({ id: produtos.id, sku: produtos.sku, nome: produtos.nome, cor: produtos.cor, paiId: produtos.paiId, ativo: produtos.ativo })
      .from(produtos)
      .orderBy(asc(produtos.nome)),
    db
      .select({ contaId: anuncios.contaId, idExterno: anuncios.idExterno, produtoId: anuncios.produtoId })
      .from(anuncios)
      .where(and(isNotNull(anuncios.idExterno), eq(anuncios.status, "publicado"))),
  ]);
  const voltar = (
    <Link href="/marketplaces" className={buttonClass("outline", "md")}>
      <ArrowLeft /> Marketplaces
    </Link>
  );
  if (!contas.length) {
    return (
      <>
        <PageHeader title="Vincular anúncios" actions={voltar} />
        <EmptyState icon={<Store />} title="Nenhuma conta conectada" description="Conecte uma conta de marketplace para ver os anúncios dela." />
      </>
    );
  }
  const contaId = contas.some((c) => String(c.id) === sp.conta) ? Number(sp.conta) : contas[0]!.id;
  const nomes = new Map(lista.map((p) => [p.id, p.nome]));

  return (
    <>
      <PageHeader
        title="Vincular anúncios"
        description="Ligue os anúncios que você já tem nos marketplaces aos produtos do cadastro. Os pedidos desses anúncios passam a baixar o estoque do produto certo."
        actions={voltar}
      />
      <VincularAnuncios
        key={contaId}
        contaId={contaId}
        contas={contas.map((c) => ({ id: c.id, nome: c.nome, marketplace: c.marketplace, marketplaceNome: MARKETPLACE_INFO[c.marketplace].nome }))}
        produtos={lista.map((p) => ({
          id: p.id,
          sku: p.sku,
          // Variação aparece com o nome do produto principal e a cor.
          titulo: p.paiId ? `${nomes.get(p.paiId) ?? p.nome}${p.cor ? ` · ${p.cor}` : ""}` : p.nome,
          ativo: p.ativo,
        }))}
        vinculos={Object.fromEntries(vinculos.filter((v) => v.contaId === contaId).map((v) => [v.idExterno!, v.produtoId]))}
      />
    </>
  );
}
