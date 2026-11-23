"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { apagarPesquisa, criarPesquisa, guardarThingiverse, itensDaPesquisa, limparPesquisas, pedidoThingiverse, reanalisar } from "@/lib/pesquisa-modelos";
import type { HitThingiverse } from "@/lib/modelos3d";

export async function novaPesquisa(form: FormData) {
  await requireUser();
  let id: number;
  try {
    id = await criarPesquisa(String(form.get("termo") ?? ""));
  } catch (e) {
    redirect(`/modelos3d?erro=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  redirect(`/modelos3d?p=${id}`);
}

/** Itens da pesquisa para a tela ir mostrando conforme a análise termina (sem recarregar a página). */
export async function andamentoPesquisa(pesquisaId: number) {
  await requireUser();
  return itensDaPesquisa(pesquisaId);
}

export async function analisarDeNovo(itemId: number) {
  await requireUser();
  await reanalisar(itemId);
}

export async function excluirPesquisa(pesquisaId: number) {
  await requireUser();
  await apagarPesquisa(pesquisaId);
  revalidatePath("/modelos3d");
}

export async function limparHistorico() {
  await requireUser();
  await limparPesquisas();
  revalidatePath("/modelos3d");
}

/** Dados para o navegador pesquisar no Thingiverse (só quando o servidor foi bloqueado). */
export async function thingiversePeloNavegador(pesquisaId: number) {
  await requireUser();
  return pedidoThingiverse(pesquisaId);
}

export async function resultadoThingiverse(pesquisaId: number, hits: HitThingiverse[] | null, erro = "") {
  await requireUser();
  await guardarThingiverse(pesquisaId, Array.isArray(hits) ? hits.slice(0, 40) : null, String(erro));
  return itensDaPesquisa(pesquisaId);
}
