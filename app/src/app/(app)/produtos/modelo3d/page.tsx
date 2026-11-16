import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listaFilamentos } from "@/lib/filamentos";
import { listaImpressoras } from "@/lib/impressoras";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";
import { ImportarModelo } from "./importar";
import { estadoCadastro } from "@/lib/cadastro-modelos";

export const metadata: Metadata = { title: "Importar modelo 3D" };

export default async function Modelo3dPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  await requireUser();
  const { link } = await searchParams;
  const [maquinas, fils, pi, pp] = await Promise.all([listaImpressoras(), listaFilamentos(), getParametrosImpressao(), getParametrosPreco()]);
  return (
    <>
      <Link href="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowLeft className="size-4" /> Produtos
      </Link>
      <PageHeader
        title="Importar modelo 3D"
        description="Cole o link do MakerWorld (Bambu), Printables, Thingiverse ou Cults, ou envie o .3mf/.stl. O sistema confere a licença, mostra em qual impressora cabe, liga as cores aos seus filamentos e já cadastra o produto com custo e preço de cada plataforma."
      />
      <ImportarModelo
        impressoras={maquinas.map((i) => ({ id: i.id, nome: i.nome, potenciaW: i.potenciaW }))}
        filamentos={fils}
        parametros={pi}
        precos={pp}
        andamento={estadoCadastro()}
        linkInicial={link && /^https:\/\//.test(link) ? link.slice(0, 500) : ""}
      />
    </>
  );
}
