"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import type { ModeloAchado } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { encaixe, listaImpressoras, type Encaixe } from "@/lib/impressoras";
import { cadastrarVarios, criarProdutoDoModelo, estadoCadastro, produtoDoModelo } from "@/lib/cadastro-modelos";
import { buscarModelos, lerModeloDoArquivo, lerModeloDoLink, type Modelo3d } from "@/lib/modelos3d";

// Modelo lido fica guardado 1 hora: o cadastro usa o que o servidor leu (não o que volta da tela).
const g = globalThis as unknown as { modelos3d?: Map<string, { m: Modelo3d; em: number }> };
const cache: Map<string, { m: Modelo3d; em: number }> = (g.modelos3d ??= new Map());

export type Leitura = { erro?: string; token?: string; modelo?: Modelo3d; encaixes?: Record<string, Encaixe[]>; jaCadastrado?: { id: string; nome: string } | null };

async function origem() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Lê o link ou o arquivo e diz em quais impressoras cabe (para cada perfil de impressão). */
export async function lerModelo(_: Leitura | null, form: FormData): Promise<Leitura> {
  await requireUser();
  try {
    const link = String(form.get("link") ?? "").trim();
    const arquivo = form.get("arquivo");
    const m =
      arquivo instanceof File && arquivo.size
        ? await lerModeloDoArquivo(arquivo.name, Buffer.from(await arquivo.arrayBuffer()), await origem(), link)
        : link
          ? await lerModeloDoLink(link)
          : null;
    if (!m) return { erro: "Cole o link do modelo ou envie o arquivo .3mf/.stl." };
    const maquinas = await listaImpressoras();
    const encaixes: Record<string, Encaixe[]> = {};
    for (const p of m.perfis.length ? m.perfis : [null]) {
      encaixes[p?.id ?? "base"] = maquinas.map((i) =>
        encaixe(i, { medidasMm: m.medidasMm, cores: p ? new Set(p.filamentos.map((f) => f.cor)).size : undefined, compativeis: p?.compativeis }),
      );
    }
    const token = randomBytes(12).toString("hex");
    for (const [k, v] of cache) if (Date.now() - v.em > 3600_000) cache.delete(k);
    cache.set(token, { m, em: Date.now() });
    return { token, modelo: m, encaixes, jaCadastrado: m.link ? await produtoDoModelo(m.link) : null };
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 300) };
  }
}

export type Escolha = {
  token: string;
  perfilId: string | null;
  /** Filamento do estoque e gramas de cada cor do modelo. */
  cores: { filamentoId: number | null; gramas: number }[];
  tempoMin: number;
  licencaPropria: boolean;
};

/** Cadastra o produto (fotos, descrição pela IA, NCM, categoria), já com filamentos, tempo, custo e preço por plataforma. */
export async function cadastrarModelo(e: Escolha): Promise<{ erro?: string; id?: string }> {
  await requireUser();
  const item = cache.get(e.token);
  if (!item) return { erro: "A leitura expirou: leia o modelo de novo." };
  if (item.m.comercial === false && !e.licencaPropria) {
    return { erro: "A licença deste modelo não permite vender as impressões. Só cadastre se você comprou a licença comercial (marque a confirmação)." };
  }
  try {
    const criado = await criarProdutoDoModelo(item.m, e, await origem());
    cache.delete(e.token);
    return { id: criado.id };
  } catch (err) {
    return { erro: (err as Error).message.slice(0, 300) };
  }
}

/** Procura o produto nos sites de modelos 3D (MakerWorld e Printables). */
export async function buscarNosSites(termo: string): Promise<{ erro?: string; modelos?: ModeloAchado[] }> {
  await requireUser();
  if (termo.trim().length < 2) return { erro: "Digite o que procurar." };
  const modelos = await buscarModelos(termo, 12).catch(() => []);
  return modelos.length ? { modelos } : { erro: "Nada encontrado. Tente em inglês (ex.: phone stand, dragon flexi)." };
}

/** "Cadastrar tudo": cadastra em segundo plano os modelos que a licença deixa vender (e pula os já cadastrados). */
export async function cadastrarTudo(modelos: { link: string; titulo: string; comercial: boolean | null }[]): Promise<{ ok?: string; erro?: string }> {
  await requireUser();
  const vendaveis = modelos.filter((m) => m.comercial === true && /^https:\/\//.test(m.link)).slice(0, 60);
  if (!vendaveis.length) return { erro: "Nenhum desses modelos tem licença que deixa vender." };
  const n = cadastrarVarios(vendaveis.map(({ link, titulo }) => ({ link, titulo: titulo.slice(0, 120) })), await origem());
  return { ok: n ? `${n} modelo(s) na fila para cadastrar.` : "Esses modelos já estão na fila." };
}

export async function andamentoCadastro() {
  await requireUser();
  return estadoCadastro();
}
