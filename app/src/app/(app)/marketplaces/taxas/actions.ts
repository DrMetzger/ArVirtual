"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  escolherTaxa,
  PLATAFORMAS_TAXA,
  salvarContrato,
  tarifasMercadoLivre,
  type MarketplaceTaxa,
} from "@/lib/taxas";

type Estado = { ok?: string; erro?: string } | null;
const plataforma = (v: FormDataEntryValue | null) => {
  const m = String(v ?? "") as MarketplaceTaxa;
  if (!PLATAFORMAS_TAXA.includes(m)) throw new Error("Plataforma inválida.");
  return m;
};

export async function enviarContrato(
  _: Estado,
  form: FormData,
): Promise<Estado> {
  await requireUser();
  try {
    const m = plataforma(form.get("marketplace"));
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || !arquivo.size)
      return { erro: "Escolha o arquivo do contrato." };
    const c = await salvarContrato(m, arquivo);
    revalidatePath("/marketplaces/taxas");
    revalidatePath("/produtos");
    return {
      ok: `Contrato lido: ${c.categorias.length} categoria(s), comissão padrão ${c.padrao.comissao}%${c.padrao.fixa ? ` + R$ ${c.padrao.fixa}` : ""}. Taxas aplicadas.`,
    };
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 300) };
  }
}

export async function escolherCategoriaContrato(
  categoriaId: number,
  marketplace: string,
  categoria: string | null,
): Promise<Estado> {
  await requireUser();
  try {
    await escolherTaxa(categoriaId, plataforma(marketplace), categoria);
    revalidatePath("/marketplaces/taxas");
    return { ok: "Salvo." };
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 200) };
  }
}

export async function relerTarifasML(): Promise<Estado> {
  await requireUser();
  try {
    const n = await tarifasMercadoLivre(true);
    revalidatePath("/marketplaces/taxas");
    return n
      ? { ok: `${n} categoria(s) atualizadas pela API do Mercado Livre.` }
      : { erro: "O Mercado Livre não respondeu (conta conectada?)." };
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 200) };
  }
}
