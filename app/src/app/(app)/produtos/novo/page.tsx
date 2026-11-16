import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ImportarLink } from "../importar-link";
import { requireUser } from "@/lib/auth";
import { listaFilamentos } from "@/lib/filamentos";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";
import { ProdutoForm } from "../produto-form";
import { listaCategorias } from "@/lib/categorias";
import { ajustesPorCategoria } from "@/lib/taxas";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo produto" description="Crie a partir de um link de anúncio ou preencha à mão (filamento e tempo de impressão calculam o custo e o preço sugerido)." />
      <div className="mb-6">
        <ImportarLink />
      </div>
      <ProdutoForm categorias={await listaCategorias()} ajustes={await ajustesPorCategoria()} parametros={await getParametrosImpressao()} precos={await getParametrosPreco()} filamentos={await listaFilamentos()} />
    </>
  );
}
