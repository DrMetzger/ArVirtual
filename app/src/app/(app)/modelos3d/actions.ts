"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { criarPesquisa, itensDaPesquisa, reanalisar } from "@/lib/pesquisa-modelos";

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
