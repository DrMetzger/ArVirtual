"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
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

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function salvarProduto(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
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
  };
  if (valores.preco <= 0) return { erro: "Informe o preço de venda." };

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
  if (id) {
    await db.update(produtos).set({ ...semEstoque, imagens, videos }).where(eq(produtos.id, id));
  } else {
    produtoId = await db.transaction(async (tx) => {
      const [novo] = await tx.insert(produtos).values({ ...semEstoque, estoque: 0, imagens, videos }).returning({ id: produtos.id });
      if (inicial > 0) await movimentar(tx, { produtoId: novo!.id, quantidade: inicial, tipo: "entrada", observacao: "Saldo inicial", usuarioId: user.sub });
      return novo!.id;
    });
  }
  revalidatePath("/produtos");
  redirect(`/produtos/${produtoId}?salvo=1`);
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
    preco: parseDecimal(form.get("preco")) || p.preco,
    estoque: p.estoque,
  };

  const resultados: ResultadoPublicacao[] = [];
  for (const conta of contas) {
    const categoria = String(form.get(`categoria_${conta.marketplace}`) ?? "").trim() || undefined;
    const a = adapter(conta.marketplace);
    try {
      const r = await a.publicar(await contaComToken(conta), p, { ...dados, categoria });
      await db.insert(anuncios).values({
        produtoId: p.id,
        contaId: conta.id,
        marketplace: conta.marketplace,
        idExterno: r.idExterno,
        link: r.link,
        status: "publicado",
        preco: dados.preco,
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
        preco: dados.preco,
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
