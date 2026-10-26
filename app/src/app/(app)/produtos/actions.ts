"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { anuncios, contasMarketplace, movimentosEstoque, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { garantirNcm, sugerirNcm, type SugestaoNcm } from "@/lib/fiscal/ncm";
import { sugerirAnuncio, type SugestaoAnuncio } from "@/lib/gemini";
import { adapter, contaComToken } from "@/lib/marketplaces";
import { movimentar } from "@/lib/estoque";
import { salvarImagem, salvarVideo } from "@/lib/uploads";
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
  cor: str.min(1, "Informe a cor de todas as variações"),
  material: str.default(""),
  filamentoId: z.number().int().nullable(),
  preco: z.number().min(0).nullable(),
  custo: z.number().min(0).default(0),
  gtin: str.transform(onlyDigits).refine((v) => !v || [8, 12, 13, 14].includes(v.length), "GTIN/EAN da variação deve ter 8, 12, 13 ou 14 dígitos"),
  estoqueInicial: z.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
});
const CANAIS_PRECO = ["mercadolivre", "shopee", "magalu", "loja"] as const;

/** Filamentos da peça: [{ filamentoId, gramas }] vindos da tela (ignora linhas vazias). */
function lerComposicao(raw: FormDataEntryValue | null) {
  try {
    const lista = JSON.parse(String(raw ?? "[]")) as { filamentoId?: unknown; gramas?: unknown }[];
    return lista
      .map((c) => ({ filamentoId: Number(c.filamentoId) > 0 ? Math.trunc(Number(c.filamentoId)) : null, gramas: Math.max(0, Math.round(Number(c.gramas) || 0)) }))
      .filter((c) => c.filamentoId || c.gramas)
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
    await salvarVariacoes(tx, pid, { ...semEstoque, imagens }, valores.temVariacoes ? variacoes : [], user.sub);
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
) {
  const atuais = await tx.select().from(produtos).where(eq(produtos.paiId, paiId));
  const mantidas = new Set(variacoes.map((v) => v.id).filter(Boolean));
  for (const v of variacoes) {
    const atributos = { Cor: v.cor, ...(v.material ? { Material: v.material } : {}) };
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
      imagens: pai.imagens,
      precosCanal: v.preco ? {} : pai.precosCanal,
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
  await db.delete(produtos).where(eq(produtos.id, id));
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

  const dados = {
    titulo: String(form.get("titulo") ?? p.nome).trim() || p.nome,
    descricao: String(form.get("descricao") ?? p.descricao).trim(),
    preco: parseDecimal(form.get("preco")),
    // Produto com variações: o anúncio leva o estoque somado das variações ativas.
    estoque: p.temVariacoes
      ? (await db.select({ estoque: produtos.estoque }).from(produtos).where(and(eq(produtos.paiId, p.id), eq(produtos.ativo, true)))).reduce((s, v) => s + v.estoque, 0)
      : p.estoque,
  };

  const resultados: ResultadoPublicacao[] = [];
  for (const conta of contas) {
    const categoria = String(form.get(`categoria_${conta.marketplace}`) ?? "").trim() || undefined;
    const a = adapter(conta.marketplace);
    try {
      // Preço digitado na hora ou o preço do canal salvo no produto (senão o preço de venda).
      const preco = dados.preco || p.precosCanal[conta.marketplace] || p.preco;
      const r = await a.publicar(await contaComToken(conta), p, { ...dados, preco, categoria });
      await db.insert(anuncios).values({
        produtoId: p.id,
        contaId: conta.id,
        marketplace: conta.marketplace,
        idExterno: r.idExterno,
        link: r.link,
        status: "publicado",
        preco,
      });
      resultados.push({
        conta: `${a.nome} · ${conta.nome}`,
        ok: true,
        mensagem: `Publicado (${r.idExterno})${r.aviso ? `. ${r.aviso}` : ""}`,
        link: r.link,
      });
    } catch (e) {
      const msg = (e as Error).message;
      await db.insert(anuncios).values({
        produtoId: p.id,
        contaId: conta.id,
        marketplace: conta.marketplace,
        status: "erro",
        preco: dados.preco || p.precosCanal[conta.marketplace] || p.preco,
        mensagem: msg.slice(0, 2000),
      });
      resultados.push({ conta: `${a.nome} · ${conta.nome}`, ok: false, mensagem: msg });
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
