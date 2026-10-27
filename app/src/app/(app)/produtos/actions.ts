"use server";

import { rm } from "node:fs/promises";
import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { anuncios, arquivosProduto, contasMarketplace, movimentosEstoque, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { garantirNcm, sugerirNcm, type SugestaoNcm } from "@/lib/fiscal/ncm";
import { sugerirAnuncio, type SugestaoAnuncio } from "@/lib/gemini";
import type { AnuncioExterno } from "@/lib/marketplaces/types";
import { adapter, contaComToken } from "@/lib/marketplaces";
import { movimentar } from "@/lib/estoque";
import { PASTA_IMPRESSAO, salvarImagem, salvarVideo } from "@/lib/uploads";
import { onlyDigits, parseDecimal } from "@/lib/utils";

export type FormState = { erro?: string; ok?: string } | null;

const str = z.string().trim();
const ProdutoSchema = z.object({
  sku: str.min(1, "Informe o SKU").max(60),
  nome: str.min(3, "Informe o nome do produto"),
  descricao: str.default(""),
  gtin: str.transform(onlyDigits).refine((v) => !v || [8, 12, 13, 14].includes(v.length), "GTIN/EAN deve ter 8, 12, 13 ou 14 dígitos"),
  ncm: str.transform(onlyDigits).pipe(z.string().length(8, "NCM deve ter 8 dígitos")),
  cest: str.transform(onlyDigits).refine((v) => !v || v.length === 7, "CEST deve ter 7 dígitos"),
  origem: z.coerce.number().int().min(0).max(8),
  unidade: str.min(1).max(6).default("UN"),
  estoque: z.coerce.number().int().default(0),
  pesoG: z.coerce.number().int().min(0).default(0),
  material: str.default(""),
  cor: str.default(""),
  filamentoG: z.coerce.number().int().min(0).default(0),
  tempoImpressaoMin: z.coerce.number().int().min(0).default(0),
  filamentoId: z.preprocess((v) => (v ? Number(v) : null), z.number().int().nullable()),
});

const VariacaoSchema = z.object({
  id: z.uuid().optional(),
  sku: str.min(1, "Informe o SKU de todas as variações").max(60),
  /** Valor da variação no tipo escolhido (ex.: Cor → "Verde"). */
  cor: str.min(1, "Informe o valor de todas as variações (ex.: Verde)"),
  material: str.default(""),
  filamentoId: z.number().int().nullable(),
  preco: z.number().min(0).nullable(),
  custo: z.number().min(0).default(0),
  gtin: str.transform(onlyDigits).refine((v) => !v || [8, 12, 13, 14].includes(v.length), "GTIN/EAN da variação deve ter 8, 12, 13 ou 14 dígitos"),
  estoqueInicial: z.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
  /** Fotos próprias já salvas e o campo de arquivo com as novas (fotosVar_<campoFotos>). */
  imagens: z.array(z.string()).default([]),
  campoFotos: z.string().regex(/^[\w.-]*$/).default(""),
});
const CANAIS_PRECO = ["mercadolivre", "shopee", "magalu", "loja"] as const;

/** Filamentos da peça: [{ filamentoId, gramas }] vindos da tela (ignora linhas vazias). */
function lerComposicao(raw: FormDataEntryValue | null) {
  try {
    const lista = JSON.parse(String(raw ?? "[]")) as { filamentoId?: unknown; gramas?: unknown; tempoMin?: unknown }[];
    return lista
      .map((c) => ({
        filamentoId: Number(c.filamentoId) > 0 ? Math.trunc(Number(c.filamentoId)) : null,
        gramas: Math.max(0, Math.round(Number(c.gramas) || 0)),
        tempoMin: Math.max(0, Math.round(Number(c.tempoMin) || 0)),
      }))
      .filter((c) => c.filamentoId || c.gramas || c.tempoMin)
      .slice(0, 16);
  } catch {
    return [];
  }
}

function lerPrecosCanal(raw: FormDataEntryValue | null) {
  try {
    const obj = JSON.parse(String(raw ?? "{}")) as Record<string, unknown>;
    return Object.fromEntries(CANAIS_PRECO.filter((c) => Number(obj[c]) > 0).map((c) => [c, Math.round(Number(obj[c]) * 100) / 100]));
  } catch {
    return {};
  }
}

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function salvarProduto(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && k !== "variacoes" && k !== "precosCanal" && k !== "composicao"));
  const parsed = ProdutoSchema.safeParse(raw);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const id = String(form.get("id") ?? "");

  const valores = {
    ...parsed.data,
    ativo: form.get("ativo") === "on",
    preco: parseDecimal(form.get("preco")),
    custo: parseDecimal(form.get("custo")),
    alturaCm: parseDecimal(form.get("alturaCm")),
    larguraCm: parseDecimal(form.get("larguraCm")),
    comprimentoCm: parseDecimal(form.get("comprimentoCm")),
    precosCanal: lerPrecosCanal(form.get("precosCanal")),
    composicao: lerComposicao(form.get("composicao")),
    temVariacoes: form.get("temVariacoes") === "1",
  };
  if (valores.preco <= 0) return { erro: "Informe o preço de venda." };

  // Variações (cores/filamentos): validadas antes de salvar qualquer coisa.
  let variacoes: z.infer<typeof VariacaoSchema>[] = [];
  if (valores.temVariacoes) {
    let lista: unknown;
    try {
      lista = JSON.parse(String(form.get("variacoes") ?? "[]"));
    } catch {
      lista = [];
    }
    const pv = z.array(VariacaoSchema).safeParse(lista);
    if (!pv.success) return { erro: pv.error.issues[0]?.message ?? "Variações inválidas" };
    variacoes = pv.data;
    if (!variacoes.length) return { erro: 'Adicione ao menos uma variação ou marque "Tem variações: Não".' };
    const skus = variacoes.map((v) => v.sku.toUpperCase());
    const repetido = skus.find((x, i) => skus.indexOf(x) !== i);
    if (repetido) return { erro: `SKU ${repetido} repetido nas variações.` };
    if (skus.includes(valores.sku.toUpperCase())) return { erro: "O SKU de uma variação não pode ser igual ao SKU base do produto." };
    const proprios = [id, ...variacoes.map((v) => v.id)].filter(Boolean) as string[];
    const conflito = (
      await db.select({ sku: produtos.sku, id: produtos.id, nome: produtos.nome }).from(produtos).where(inArray(produtos.sku, variacoes.map((v) => v.sku)))
    ).find((o) => !proprios.includes(o.id));
    if (conflito) return { erro: `SKU ${conflito.sku} já usado por "${conflito.nome}".` };
  }

  const dup = await db.query.produtos.findFirst({
    where: id ? and(eq(produtos.sku, valores.sku), ne(produtos.id, id)) : eq(produtos.sku, valores.sku),
  });
  if (dup) return { erro: `SKU já usado por "${dup.nome}".` };

  // Imagens e vídeos na ordem escolhida na tela: "e:<url>" (já salva) ou "n:<i>" (i-ésimo arquivo enviado agora).
  const atuais = id ? await db.query.produtos.findFirst({ where: eq(produtos.id, id), columns: { imagens: true, videos: true } }) : undefined;
  let imagens: string[];
  let videos: string[];
  try {
    const o = await origin();
    imagens = await ordenarMidias(form, "ordemImagens", "novasImagens", atuais?.imagens ?? [], (f) => salvarImagem(f, o));
    videos = await ordenarMidias(form, "ordemVideos", "novosVideos", atuais?.videos ?? [], (f) => salvarVideo(f, o));
  } catch (e) {
    return { erro: (e as Error).message };
  }
  if (videos.length > 3) return { erro: "No máximo 3 vídeos por produto." };

  // Fotos de cada variação: as que já eram dela (ou do produto) mais as enviadas agora.
  if (variacoes.length) {
    const antigas = new Set([
      ...(atuais?.imagens ?? []),
      ...(id ? (await db.select({ imagens: produtos.imagens }).from(produtos).where(eq(produtos.paiId, id))).flatMap((v) => v.imagens) : []),
    ]);
    try {
      const o = await origin();
      for (const v of variacoes) {
        const novas = v.campoFotos ? form.getAll(`fotosVar_${v.campoFotos}`).filter((f): f is File => f instanceof File && f.size > 0) : [];
        v.imagens = [...v.imagens.filter((u) => antigas.has(u)), ...(await Promise.all(novas.map((f) => salvarImagem(f, o))))].slice(0, 12);
      }
    } catch (e) {
      return { erro: (e as Error).message };
    }
  }
  const tipoVariacao = String(form.get("tipoVariacao") ?? "").trim().slice(0, 30) || "Cor";

  let produtoId = id;
  // NCM novo entra no cadastro e a IA completa a descrição e o IPI (em segundo plano, como no ERP Vanguard).
  void garantirNcm(valores.ncm);
  // O saldo só muda pelo estoque (kardex): na edição é ignorado; no cadastro vira o saldo inicial.
  const { estoque: inicial, ...semEstoque } = valores;
  produtoId = await db.transaction(async (tx) => {
    let pid = id;
    if (id) {
      await tx.update(produtos).set({ ...semEstoque, imagens, videos }).where(eq(produtos.id, id));
    } else {
      const [novo] = await tx.insert(produtos).values({ ...semEstoque, estoque: 0, imagens, videos }).returning({ id: produtos.id });
      pid = novo!.id;
      if (inicial > 0 && !valores.temVariacoes) {
        await movimentar(tx, { produtoId: pid, quantidade: inicial, tipo: "entrada", observacao: "Saldo inicial", usuarioId: user.sub });
      }
    }
    await salvarVariacoes(tx, pid, { ...semEstoque, imagens }, valores.temVariacoes ? variacoes : [], user.sub, tipoVariacao);
    return pid;
  });
  revalidatePath("/produtos");
  redirect(`/produtos/${produtoId}?salvo=1`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Grava as variações como itens filhos do produto (SKU, estoque, filamento e preço próprios; o resto vem do pai).
 * Variação removida some se nunca movimentou estoque; senão fica desativada (o histórico continua).
 */
async function salvarVariacoes(
  tx: Tx,
  paiId: string,
  pai: Omit<typeof produtos.$inferInsert, "id" | "estoque">,
  variacoes: z.infer<typeof VariacaoSchema>[],
  usuarioId: string,
  tipo = "Cor",
) {
  const atuais = await tx.select().from(produtos).where(eq(produtos.paiId, paiId));
  const mantidas = new Set(variacoes.map((v) => v.id).filter(Boolean));
  for (const v of variacoes) {
    // Tipo da variação (Cor, Tamanho, Modelo...) → valor; o Mercado Livre usa "Cor" como COLOR.
    const atributos = { [tipo]: v.cor, ...(v.material && tipo !== "Material" ? { Material: v.material } : {}) };
    const dados = {
      sku: v.sku,
      nome: `${pai.nome} - ${v.cor}${v.material && v.material !== pai.material ? ` ${v.material}` : ""}`,
      descricao: pai.descricao,
      gtin: v.gtin,
      ncm: pai.ncm,
      cest: pai.cest,
      origem: pai.origem,
      unidade: pai.unidade,
      preco: v.preco || pai.preco,
      custo: v.custo,
      pesoG: pai.pesoG,
      alturaCm: pai.alturaCm,
      larguraCm: pai.larguraCm,
      comprimentoCm: pai.comprimentoCm,
      material: v.material,
      cor: v.cor,
      filamentoG: pai.filamentoG,
      tempoImpressaoMin: pai.tempoImpressaoMin,
      filamentoId: v.filamentoId,
      // O 1º filamento da composição é o da cor da variação; os demais são os do produto.
      composicao: (pai.composicao?.length ? pai.composicao : [{ filamentoId: null, gramas: pai.filamentoG ?? 0 }]).map((c, i) =>
        i === 0 ? { ...c, filamentoId: v.filamentoId } : c,
      ),
      // Fotos próprias da variação (sem elas, os anúncios usam as do produto principal).
      imagens: v.imagens,
      // Preço por plataforma do produto; variação mais cara/barata leva a mesma diferença em todas.
      precosCanal: Object.fromEntries(
        Object.entries(pai.precosCanal ?? {}).map(([k, val]) => [k, Math.round(((val as number) + (v.preco ? v.preco - (pai.preco ?? 0) : 0)) * 100) / 100]),
      ),
      paiId,
      atributos,
      ativo: Boolean(pai.ativo) && v.ativo,
    };
    const existente = v.id ? atuais.find((a) => a.id === v.id) : undefined;
    if (existente) {
      await tx.update(produtos).set(dados).where(eq(produtos.id, existente.id));
    } else {
      const [nova] = await tx.insert(produtos).values({ ...dados, estoque: 0 }).returning({ id: produtos.id });
      if (v.estoqueInicial > 0) {
        await movimentar(tx, { produtoId: nova!.id, quantidade: v.estoqueInicial, tipo: "entrada", observacao: "Saldo inicial da variação", usuarioId });
      }
    }
  }
  // Produto que já tinha estoque e passou a ter variações: o saldo vai para a primeira variação.
  const saldoPai = (await tx.query.produtos.findFirst({ where: eq(produtos.id, paiId), columns: { estoque: true } }))?.estoque ?? 0;
  if (variacoes.length && saldoPai) {
    const primeira = await tx.query.produtos.findFirst({ where: and(eq(produtos.paiId, paiId), eq(produtos.sku, variacoes[0]!.sku)) });
    if (primeira) {
      await movimentar(tx, { produtoId: paiId, quantidade: -saldoPai, tipo: "ajuste", observacao: `Transferido para a variação ${primeira.sku}`, usuarioId });
      await movimentar(tx, { produtoId: primeira.id, quantidade: saldoPai, tipo: "ajuste", observacao: "Saldo do produto antes das variações", usuarioId });
    }
  }
  for (const a of atuais.filter((x) => !mantidas.has(x.id))) {
    const movimentos = await tx.$count(movimentosEstoque, eq(movimentosEstoque.produtoId, a.id));
    if (movimentos || a.estoque) await tx.update(produtos).set({ ativo: false }).where(eq(produtos.id, a.id));
    else await tx.delete(produtos).where(eq(produtos.id, a.id));
  }
}

export async function excluirProduto(id: string) {
  await requireUser();
  // Os registros dos arquivos de impressão saem junto (cascade); os arquivos no disco, aqui.
  const arquivos = await db.select({ arquivo: arquivosProduto.arquivo }).from(arquivosProduto).where(eq(arquivosProduto.produtoId, id));
  await db.delete(produtos).where(eq(produtos.id, id));
  await Promise.all(arquivos.map((a) => rm(`${PASTA_IMPRESSAO}/${a.arquivo}`, { force: true })));
  revalidatePath("/produtos");
  redirect("/produtos");
}

export async function gerarAnuncioIA(produtoId: string): Promise<{ erro?: string; sugestao?: SugestaoAnuncio }> {
  await requireUser();
  const p = await db.query.produtos.findFirst({ where: eq(produtos.id, produtoId) });
  if (!p) return { erro: "Produto não encontrado." };
  try {
    return {
      sugestao: await sugerirAnuncio({
        nome: p.nome,
        descricao: p.descricao,
        material: p.material,
        cor: p.cor,
        pesoG: p.pesoG,
        dimensoes: `${p.comprimentoCm} x ${p.larguraCm} x ${p.alturaCm} cm`,
      }),
    };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export type ResultadoPublicacao = { conta: string; ok: boolean; mensagem: string; link?: string };

export async function publicarAnuncio(produtoId: string, form: FormData): Promise<ResultadoPublicacao[]> {
  await requireUser();
  const p = await db.query.produtos.findFirst({ where: eq(produtos.id, produtoId) });
  if (!p) return [{ conta: "-", ok: false, mensagem: "Produto não encontrado." }];

  const contaIds = form.getAll("contas").map(Number).filter(Boolean);
  if (!contaIds.length) return [{ conta: "-", ok: false, mensagem: "Selecione ao menos uma conta de marketplace." }];
  const contas = await db.select().from(contasMarketplace).where(inArray(contasMarketplace.id, contaIds));

  const cfgMl = await getSettings(["mercadolivre.tipoAnuncio", "mercadolivre.freteGratis"]);
  const tipo = String(form.get("ml_tipo") || cfgMl["mercadolivre.tipoAnuncio"] || "classico");
  const frete = String(form.get("ml_frete") || cfgMl["mercadolivre.freteGratis"] || "automatico");
  const dados = {
    titulo: String(form.get("titulo") ?? p.nome).trim() || p.nome,
    descricao: String(form.get("descricao") ?? p.descricao).trim(),
    preco: parseDecimal(form.get("preco")),
    tipoAnuncio: (tipo === "premium" ? "premium" : "classico") as "classico" | "premium",
    freteGratis: (["sempre", "nunca"].includes(frete) ? frete : "automatico") as "automatico" | "sempre" | "nunca",
  };
  // Produto com variações: um anúncio por variação escolhida na tela, no mesmo grupo (Magalu) / família (Mercado Livre).
  const escolhidas = form.getAll("itens").map(String);
  const itens = p.temVariacoes
    ? (await db.select().from(produtos).where(and(eq(produtos.paiId, p.id), eq(produtos.ativo, true))).orderBy(produtos.cor)).filter(
        (v) => escolhidas.includes(v.id),
      )
    : [p];
  if (!itens.length) return [{ conta: "-", ok: false, mensagem: p.temVariacoes ? "Escolha ao menos uma variação para publicar." : "Produto não encontrado." }];

  const resultados: ResultadoPublicacao[] = [];
  for (const conta of contas) {
    const categoria = String(form.get(`categoria_${conta.marketplace}`) ?? "").trim() || undefined;
    const a = adapter(conta.marketplace);
    const token = await contaComToken(conta).catch((e: Error) => e);
    // Nunca duplicar: o que já tem anúncio nesta conta (no histórico ou na própria plataforma, pelo SKU) não é publicado de novo.
    const jaNoHistorico = new Map(
      (
        await db
          .select({ produtoId: anuncios.produtoId, idExterno: anuncios.idExterno })
          .from(anuncios)
          .where(and(eq(anuncios.contaId, conta.id), eq(anuncios.status, "publicado"), inArray(anuncios.produtoId, itens.map((x) => x.id))))
      ).map((x) => [x.produtoId, x.idExterno]),
    );
    let naPlataforma: AnuncioExterno[];
    try {
      if (token instanceof Error) throw token;
      naPlataforma = itens.every((x) => jaNoHistorico.has(x.id)) ? [] : await a.anuncios(token);
    } catch (e) {
      resultados.push({
        conta: `${a.nome} · ${conta.nome}`,
        ok: false,
        mensagem: `Não consegui conferir os anúncios que já existem (${(e as Error).message}). Nada foi publicado para não duplicar.`,
      });
      continue;
    }
    for (const [i, item] of itens.entries()) {
      const rotuloItem = `${a.nome} · ${conta.nome}${p.temVariacoes ? ` · ${item.cor || item.sku}` : ""}`;
      if (jaNoHistorico.has(item.id)) {
        resultados.push({ conta: rotuloItem, ok: true, mensagem: `Já anunciado (${jaNoHistorico.get(item.id) ?? "sem código"}): não publiquei de novo.` });
        continue;
      }
      const sku = item.sku.trim().toLowerCase();
      const existente = naPlataforma.find((x) => x.sku.trim().toLowerCase() === sku || x.idExterno.toLowerCase() === sku);
      if (existente) {
        await db.insert(anuncios).values({
          produtoId: item.id,
          contaId: conta.id,
          marketplace: conta.marketplace,
          idExterno: existente.idExterno,
          link: existente.link,
          status: "publicado",
          preco: existente.preco ?? item.precosCanal[conta.marketplace] ?? item.preco,
          mensagem: "Vinculado: já existia na plataforma com o mesmo SKU",
        });
        resultados.push({ conta: rotuloItem, ok: true, mensagem: `Já existia na plataforma (${existente.idExterno}, mesmo SKU): vinculado, não publiquei de novo.`, link: existente.link });
        continue;
      }
      // Preço desta plataforma na tela de publicar (variação: o dela), senão o do cadastro, senão o preço de venda.
      const naTela = parseDecimal(form.get(`preco_${conta.marketplace}`)) || dados.preco;
      // Variação com preço próprio: a diferença para o produto vale em todas as plataformas.
      const diferenca = p.temVariacoes ? item.preco - p.preco : 0;
      const preco = (naTela ? Math.round((naTela + diferenca) * 100) / 100 : 0) || item.precosCanal[conta.marketplace] || item.preco;
      const rotulo = `${a.nome} · ${conta.nome}${p.temVariacoes ? ` · ${item.cor || item.sku}` : ""}`;
      try {
        if (token instanceof Error) throw token;
        const r = await a.publicar(token, { ...item, imagens: item.imagens.length ? item.imagens : p.imagens }, {
          titulo: p.temVariacoes ? `${dados.titulo} ${item.cor}`.trim().slice(0, 60) : dados.titulo,
          descricao: dados.descricao,
          preco,
          estoque: item.estoque,
          tipoAnuncio: dados.tipoAnuncio,
          freteGratis: dados.freteGratis,
          categoria,
          ...(p.temVariacoes ? { grupo: p.sku, principal: i === 0, familia: dados.titulo } : {}),
        });
        await db.insert(anuncios).values({ produtoId: item.id, contaId: conta.id, marketplace: conta.marketplace, idExterno: r.idExterno, link: r.link, status: "publicado", preco });
        resultados.push({ conta: rotulo, ok: true, mensagem: `Publicado (${r.idExterno})${r.aviso ? `. ${r.aviso}` : ""}`, link: r.link });
      } catch (e) {
        const msg = (e as Error).message;
        await db.insert(anuncios).values({ produtoId: item.id, contaId: conta.id, marketplace: conta.marketplace, status: "erro", preco, mensagem: msg.slice(0, 2000) });
        resultados.push({ conta: rotulo, ok: false, mensagem: msg });
      }
    }
  }
  revalidatePath(`/produtos/${produtoId}`);
  return resultados;
}

export async function sugerirNcmIA(produto: { nome: string; descricao: string; material: string }): Promise<{ erro?: string; sugestoes?: SugestaoNcm[] }> {
  await requireUser();
  if (produto.nome.trim().length < 3) return { erro: "Preencha o nome do produto primeiro." };
  try {
    const sugestoes = await sugerirNcm(produto);
    return sugestoes.length ? { sugestoes } : { erro: "A IA não encontrou um NCM para este produto." };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

async function ordenarMidias(form: FormData, campoOrdem: string, campoArquivos: string, existentes: string[], salvar: (f: File) => Promise<string>) {
  const arquivos = form.getAll(campoArquivos).filter((f): f is File => f instanceof File && f.size > 0);
  let ordem: string[] = [];
  try {
    ordem = JSON.parse(String(form.get(campoOrdem) ?? "[]"));
  } catch {
    ordem = [];
  }
  const enviados = await Promise.all(arquivos.map(salvar));
  const out: string[] = [];
  for (const t of ordem) {
    // Só aceita URLs que já eram do produto (a ordem vem do navegador).
    if (t.startsWith("e:") && existentes.includes(t.slice(2))) out.push(t.slice(2));
    else if (t.startsWith("n:") && enviados[Number(t.slice(2))]) out.push(enviados[Number(t.slice(2))]!);
  }
  // Arquivo enviado sem posição na ordem (não deveria acontecer) vai para o fim.
  for (const u of enviados) if (!out.includes(u)) out.push(u);
  return out;
}
