"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { produtos, type OrigemModelo3d } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listaFilamentos } from "@/lib/filamentos";
import { custoComposicao, gramasTotais } from "@/lib/impressao";
import { encaixe, listaImpressoras, type Encaixe } from "@/lib/impressoras";
import { importarProduto } from "@/lib/importar-produto";
import { lerModeloDoArquivo, lerModeloDoLink, type Modelo3d } from "@/lib/modelos3d";
import { precosPorCanal } from "@/lib/precificacao";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";

// Modelo lido fica guardado 1 hora: o cadastro usa o que o servidor leu (não o que volta da tela).
const g = globalThis as unknown as { modelos3d?: Map<string, { m: Modelo3d; em: number }> };
const cache: Map<string, { m: Modelo3d; em: number }> = (g.modelos3d ??= new Map());

export type Leitura = { erro?: string; token?: string; modelo?: Modelo3d; encaixes?: Record<string, Encaixe[]> };

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
    return { token, modelo: m, encaixes };
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
  const m = item.m;
  if (m.comercial === false && !e.licencaPropria) {
    return { erro: "A licença deste modelo não permite vender as impressões. Só cadastre se você comprou a licença comercial (marque a confirmação)." };
  }
  try {
    const perfil = m.perfis.find((p) => p.id === e.perfilId) ?? null;
    const [maquinas, fils, pi, pp] = await Promise.all([listaImpressoras(), listaFilamentos(), getParametrosImpressao(), getParametrosPreco()]);
    const cabe = maquinas.filter(
      (i) => encaixe(i, { medidasMm: m.medidasMm, cores: perfil ? new Set(perfil.filamentos.map((f) => f.cor)).size : undefined, compativeis: perfil?.compativeis }).cabe !== false,
    );
    const composicao = e.cores.filter((c) => c.gramas > 0 || c.filamentoId).map((c) => ({ filamentoId: c.filamentoId, gramas: Math.max(0, Math.round(c.gramas)) }));
    const tempoMin = Math.max(0, Math.round(e.tempoMin));
    // Energia pela impressora que vai imprimir (a primeira em que cabe).
    const custo = custoComposicao(composicao, tempoMin, { ...pi, potenciaW: cabe[0]?.potenciaW ?? pi.potenciaW }, fils).custo;
    const sugeridos = custo > 0 ? precosPorCanal(custo, 0, pp) : [];
    const preco = sugeridos.find((s) => s.canal === "loja")?.sugerido ?? 0;
    const medidasCm = m.medidasMm ? [...m.medidasMm].map((v) => Math.round(v) / 10) : null;
    const it = importarProduto(m.link || m.titulo, process.env.APP_URL ?? (await origem()), {
      titulo: m.titulo,
      descricao: m.descricao,
      fotos: m.fotos,
      videos: [],
      preco,
      pesoG: Math.round(gramasTotais(composicao) || perfil?.pesoG || m.pesoEstimadoG || 0),
      ...(medidasCm ? { larguraCm: medidasCm[0], comprimentoCm: medidasCm[1], alturaCm: medidasCm[2] } : {}),
      link: m.link,
    });
    let criado: { id: string } | null = null;
    for (;;) {
      const r = await it.next();
      if (r.done) {
        criado = r.value;
        break;
      }
    }
    const principal = fils.find((f) => f.id === composicao[0]?.filamentoId);
    const origemModelo: OrigemModelo3d = {
      fonte: m.fonte,
      link: m.link,
      autor: m.autor,
      licenca: m.licenca,
      comercial: m.comercial,
      ...(m.comercial === false ? { licencaComercialPropria: true } : {}),
      medidasMm: m.medidasMm,
      impressoras: cabe.map((i) => i.id),
    };
    await db
      .update(produtos)
      .set({
        composicao,
        filamentoId: composicao[0]?.filamentoId ?? null,
        filamentoG: gramasTotais(composicao),
        tempoImpressaoMin: tempoMin,
        material: principal?.material ?? perfil?.filamentos[0]?.tipo ?? "PLA",
        cor: principal?.cor ?? "",
        custo,
        preco,
        precosCanal: Object.fromEntries(sugeridos.filter((s) => s.canal !== "loja" && s.sugerido > 0).map((s) => [s.canal, s.sugerido])),
        modelo3d: origemModelo,
        atualizadoEm: new Date(),
      })
      .where(eq(produtos.id, criado!.id));
    cache.delete(e.token);
    return { id: criado!.id };
  } catch (err) {
    return { erro: (err as Error).message.slice(0, 300) };
  }
}
