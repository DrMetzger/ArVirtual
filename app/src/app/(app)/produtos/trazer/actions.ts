"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { coletarRaioX } from "@/lib/raiox";
import { estadoTrazer, trazerGrupos } from "@/lib/trazer-anuncios";

/** Progresso do trabalho (quadro ao vivo na tela); null se nunca rodou. */
export async function trazerEmAndamento() {
  await requireUser();
  const e = estadoTrazer();
  return e
    ? { rodando: !e.fim, feitos: e.feitos, total: e.total, atual: e.atual, criados: e.criados.slice(-12), ligados: e.ligados, erros: e.erros.slice(-10) }
    : null;
}

export async function trazerSelecionados(form: FormData) {
  await requireUser();
  const chaves = form.getAll("g").map(String).filter(Boolean);
  if (!chaves.length) redirect("/produtos/trazer?erro=" + encodeURIComponent("Marque ao menos um anúncio."));
  trazerGrupos(chaves);
  revalidatePath("/produtos");
  redirect("/produtos/trazer");
}

let lendo = false;
export async function relerAnuncios() {
  await requireUser();
  if (!lendo) {
    lendo = true;
    void coletarRaioX().finally(() => (lendo = false));
  }
  redirect("/produtos/trazer?lendo=1");
}
