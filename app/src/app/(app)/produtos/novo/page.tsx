import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listaFilamentos } from "@/lib/filamentos";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";
import { ProdutoForm } from "../produto-form";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProdutoPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Novo produto" description="Informe filamento e tempo de impressão para calcular custo e preço sugerido." />
      <ProdutoForm parametros={await getParametrosImpressao()} precos={await getParametrosPreco()} filamentos={await listaFilamentos()} />
    </>
  );
}
