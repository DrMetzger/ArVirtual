"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { sugerirAnuncio, type SugestaoAnuncio } from "@/lib/gemini";
import { adapter, contaComToken } from "@/lib/marketplaces";
import { salvarImagem } from "@/lib/uploads";
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
});

async function origin() {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function salvarProduto(_: FormState, form: FormData): Promise<FormState> {
  await requireUser();
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

  // Imagens: as já existentes (na ordem do formulário) + novos envios.
  const imagens = form.getAll("imagensExistentes").map(String);
  try {
    const o = await origin();
    for (const f of form.getAll("novasImagens")) {
      if (f instanceof File && f.size > 0) imagens.push(await salvarImagem(f, o));
    }
  } catch (e) {
    return { erro: (e as Error).message };
  }

  let produtoId = id;
  if (id) {
    await db.update(produtos).set({ ...valores, imagens }).where(eq(produtos.id, id));
  } else {
    const [novo] = await db.insert(produtos).values({ ...valores, imagens }).returning({ id: produtos.id });
    produtoId = novo!.id;
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
      resultados.push({ conta: `${a.nome} · ${conta.nome}`, ok: true, mensagem: `Publicado (${r.idExterno})`, link: r.link });
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
