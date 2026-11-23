import { Search } from "lucide-react";
import type { Metadata } from "next";
import { Alert, Card, Input, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { requireUser } from "@/lib/auth";
import { estadoCadastro } from "@/lib/cadastro-modelos";
import { itensDaPesquisa, listaPesquisas } from "@/lib/pesquisa-modelos";
import { formatDate } from "@/lib/utils";
import { novaPesquisa } from "./actions";
import { HistoricoPesquisas } from "./historico";
import { ResultadosPesquisa } from "./resultados";

export const metadata: Metadata = { title: "Modelos 3D" };

export default async function PesquisaModelosPage({ searchParams }: { searchParams: Promise<{ p?: string; erro?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  // Mesmo termo pesquisado de novo: fica só a mais recente no histórico.
  const pesquisas = (await listaPesquisas()).filter((x, i, xs) => xs.findIndex((y) => y.termo.toLowerCase() === x.termo.toLowerCase()) === i);
  const atual = pesquisas.find((x) => String(x.id) === sp.p) ?? pesquisas[0];
  const itens = atual ? await itensDaPesquisa(atual.id) : [];
  return (
    <>
      <PageHeader
        title="Modelos 3D"
        description="Todos os modelos de 6 sites (MakerWorld, Printables, Sketchfab, Thingiverse, Cults3D e MyMiniFactory) para o que você procurar, com o mercado de cada um no Magalu, Mercado Livre e Shopee: quem vende, por quanto, quanto vende e o preço para você concorrer."
      />
      <Card className="mb-5 p-5">
        <form action={novaPesquisa} className="flex gap-2">
          <Input name="termo" required minLength={2} maxLength={80} placeholder="Ex.: suporte placa de vídeo, porta controle, dragão articulado" className="min-w-0 flex-1" />
          <SubmitButton pendingText="Procurando os modelos...">
            <Search /> Pesquisar
          </SubmitButton>
        </form>
        {sp.erro ? (
          <div className="mt-3">
            <Alert>{sp.erro}</Alert>
          </div>
        ) : null}
        {pesquisas.length ? (
          <HistoricoPesquisas pesquisas={pesquisas.map((x) => ({ id: x.id, termo: x.termo, quando: formatDate(x.criadoEm) }))} atualId={atual?.id ?? null} />
        ) : null}
      </Card>
      {atual ? <ResultadosPesquisa key={atual.id} pesquisaId={atual.id} termo={atual.termo} inicial={itens} andamento={estadoCadastro()} fontes={atual.fontes} /> : null}
    </>
  );
}
