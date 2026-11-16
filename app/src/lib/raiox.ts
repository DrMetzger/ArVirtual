import "server-only";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { contasMarketplace, pedidosMarketplace, raioxAnuncios } from "@/db/schema";
import { adapter, contaComToken } from "@/lib/marketplaces";
import { situacaoPedido } from "@/lib/marketplaces/situacao";

/**
 * Raio-X dos anúncios: lê TODOS os anúncios de cada conta, junta visitas/qualidade da plataforma com as vendas dos
 * pedidos do ERP e calcula, por plataforma, conversão corrigida (média bayesiana), diagnóstico e quanto cada anúncio
 * deixa de faturar.
 */
let rodando = false;
export async function coletarRaioX() {
  if (rodando) return;
  rodando = true;
  try {
    const contas = await db.select().from(contasMarketplace);
    const desde = new Date(Date.now() - 30 * 86400_000);
    const pedidos = await db
      .select({ marketplace: pedidosMarketplace.marketplace, contaId: pedidosMarketplace.contaId, status: pedidosMarketplace.status, itens: pedidosMarketplace.itens })
      .from(pedidosMarketplace)
      .where(gte(pedidosMarketplace.data, desde));
    for (const c of contas) {
      try {
        const a = adapter(c.marketplace);
        const token = await contaComToken(c);
        const lista = (await a.anuncios(token)).filter((x) => x.status === "ativo" || x.status === "pausado");
        const dados = a.raiox ? await a.raiox(token, lista.filter((x) => x.status === "ativo").map((x) => x.idExterno)).catch(() => ({})) : {};
        // Vendas dos últimos 30 dias por anúncio (pelo id do anúncio no item do pedido; Magalu usa o SKU).
        const vendas = new Map<string, { un: number; fat: number }>();
        for (const p of pedidos) {
          if (p.contaId !== c.id || ["cancelado", "aguardando"].includes(situacaoPedido(p.marketplace, p.status))) continue;
          for (const i of p.itens) {
            const k = (i.idAnuncio || i.sku || "").toLowerCase();
            const v = vendas.get(k) ?? { un: 0, fat: 0 };
            v.un += i.quantidade;
            v.fat += i.quantidade * i.valorUnitario;
            vendas.set(k, v);
          }
        }
        for (const x of lista) {
          const d = (dados as Record<string, import("@/lib/marketplaces/types").DadosRaioX>)[x.idExterno] ?? {};
          const v = vendas.get(x.idExterno.toLowerCase()) ?? vendas.get(x.sku.toLowerCase()) ?? { un: 0, fat: 0 };
          const valores = {
            marketplace: c.marketplace,
            titulo: x.titulo.slice(0, 300),
            imagem: x.imagem,
            link: x.link,
            preco: x.preco ?? 0,
            status: x.status,
            visitas: d.visitas ?? null,
            periodo: d.periodo ?? "",
            vendas30: v.un,
            faturamento30: Math.round(v.fat * 100) / 100,
            vendasTotal: d.vendasTotal ?? null,
            fotos: d.fotos ?? null,
            premium: d.premium ?? null,
            freteGratis: d.freteGratis ?? null,
            qualidade: d.qualidade ?? null,
            atualizadoEm: new Date(),
          };
          await db
            .insert(raioxAnuncios)
            .values({ contaId: c.id, idExterno: x.idExterno, ...valores })
            .onConflictDoUpdate({ target: [raioxAnuncios.contaId, raioxAnuncios.idExterno], set: valores });
        }
        // Anúncio que sumiu da plataforma (encerrado/excluído) sai do raio-x.
        const ids = lista.map((x) => x.idExterno);
        if (ids.length) await db.delete(raioxAnuncios).where(and(eq(raioxAnuncios.contaId, c.id), notInArray(raioxAnuncios.idExterno, ids)));
      } catch (e) {
        console.warn(`[raio-x] ${c.marketplace} ${c.nome}: ${(e as Error).message}`);
      }
    }
  } finally {
    rodando = false;
  }
}

let ultima = 0;
export async function rotinaRaioX() {
  if (Date.now() - ultima < 6 * 3600_000) return;
  ultima = Date.now();
  await coletarRaioX();
}

// ------------------------------------------------------------------------------------------- matemática

export type Diagnostico = "campeao" | "trafego" | "conversao" | "parado" | "ok" | "sem-dados";
export const DIAGNOSTICOS: Record<Diagnostico, { nome: string; tom: "green" | "gold" | "red" | "blue" | "neutral"; acao: string }> = {
  campeao: { nome: "Campeão", tom: "green", acao: "Garanta estoque, crie variações (cor/tamanho/kit) e leve para as outras plataformas." },
  conversao: { nome: "Falta conversão", tom: "red", acao: "Muita gente vê e pouca compra: revise preço contra os concorrentes, a 1ª foto e a descrição." },
  trafego: { nome: "Falta tráfego", tom: "gold", acao: "Converte bem, mas pouca gente vê: título com as palavras que o comprador busca, anúncio Premium/Ads e categoria certa." },
  parado: { nome: "Parado", tom: "red", acao: "Sem visita e sem venda: refaça título e fotos, revise a categoria ou pause e use o espaço em outro produto." },
  ok: { nome: "Na média", tom: "blue", acao: "Dentro da média da loja: siga as melhorias abaixo para subir." },
  "sem-dados": { nome: "Sem dados de visita", tom: "neutral", acao: "A plataforma não informa visitas por API: o diagnóstico usa só as vendas." },
};

type Linha = typeof raioxAnuncios.$inferSelect;
export type LinhaRaioX = Linha & {
  conversao: number | null;
  conversaoAjustada: number | null;
  diagnostico: Diagnostico;
  ganho: number;
  saude: number;
  melhorias: string[];
};

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Melhorias por regra (o que todo anúncio que vende tem), além das ações que a própria plataforma pede. */
function regras(l: Linha, d: Diagnostico): string[] {
  const out: string[] = [];
  const titulo = l.titulo.trim();
  const limite = l.marketplace === "mercadolivre" ? 60 : l.marketplace === "shopee" ? 120 : 150;
  if (titulo.length < Math.min(40, limite * 0.6)) out.push(`Título curto (${titulo.length} caracteres): use até ${limite} com produto + material + uso + medida + diferencial.`);
  if (/(.)\1{3,}|[A-Z]{12,}/.test(titulo)) out.push("Título com letras repetidas ou tudo maiúsculo: o buscador e o comprador preferem texto normal.");
  const minFotos = l.marketplace === "mercadolivre" ? 6 : 5;
  if (l.fotos != null && l.fotos < minFotos) out.push(`Só ${l.fotos} foto(s): coloque ${minFotos} ou mais (fundo branco, em uso, medidas, detalhes, embalagem).`);
  if (l.marketplace === "mercadolivre" && l.premium === false && (d === "trafego" || d === "campeao")) out.push("Anúncio Clássico: o Premium aparece mais e parcela sem juros; vale testar neste.");
  if (l.marketplace === "mercadolivre" && l.freteGratis === false && l.preco >= 79) out.push("Acima de R$ 79 sem frete grátis: o ML rebaixa; ative o frete grátis.");
  if (l.status === "pausado") out.push("Anúncio pausado: reative se tiver estoque (anúncio pausado perde posição).");
  return out;
}

/** Diagnóstico por plataforma: cada anúncio comparado com a média da própria loja naquela plataforma. */
export function analisarRaioX(linhas: Linha[]) {
  const porPlataforma = new Map<string, Linha[]>();
  for (const l of linhas) porPlataforma.set(l.marketplace, [...(porPlataforma.get(l.marketplace) ?? []), l]);
  const resultado: LinhaRaioX[] = [];
  const resumo: Record<string, { anuncios: number; ativos: number; visitas: number; vendas: number; conversao: number | null; notaMedia: number | null; ganho: number; periodo: string }> = {};
  for (const [mp, ls] of porPlataforma) {
    const ativos = ls.filter((l) => l.status === "ativo");
    const comVisita = ativos.filter((l) => l.visitas != null);
    // Shopee informa vendas desde a publicação, mas às vezes atrasa: vale o maior entre ela e os pedidos do ERP.
    const vendasDe = (l: Linha) => (l.periodo === "total" ? Math.max(l.vendasTotal ?? 0, l.vendas30) : l.vendas30);
    const totV = comVisita.reduce((s, l) => s + (l.visitas ?? 0), 0);
    const totS = comVisita.reduce((s, l) => s + vendasDe(l), 0);
    const p0 = totV > 0 ? totS / totV : 0;
    // Média bayesiana: cada anúncio "começa" com 100 visitas na conversão média da loja.
    const K = 100;
    const medV = mediana(comVisita.map((l) => l.visitas ?? 0));
    const notas = ativos.map((l) => l.qualidade?.nota).filter((n): n is number => typeof n === "number");
    let ganhoTotal = 0;
    for (const l of ls) {
      let conversao: number | null = null;
      let ajustada: number | null = null;
      let diag: Diagnostico = "sem-dados";
      let ganho = 0;
      if (l.visitas != null && l.status === "ativo") {
        const v = l.visitas;
        const s = vendasDe(l);
        conversao = v > 0 ? s / v : null;
        ajustada = (s + p0 * K) / (v + K);
        if (s > 0 && ajustada >= p0 && v >= medV) diag = "campeao";
        else if (v >= medV && (s === 0 || ajustada < 0.7 * p0)) diag = "conversao";
        else if (s === 0 && v < medV * 0.5) diag = "parado";
        else if (v < medV * 0.6) diag = "trafego";
        else diag = "ok";
        if (diag === "conversao") ganho = Math.max(0, v * (p0 - ajustada)) * l.preco;
        else if (diag === "trafego" || diag === "parado") ganho = Math.max(0, medV - v) * Math.max(ajustada, p0) * l.preco;
      } else if (l.status === "ativo") {
        diag = l.vendas30 > 0 ? "ok" : "sem-dados";
      }
      ganho = Math.round(ganho * 100) / 100;
      ganhoTotal += ganho;
      // Saúde 0–100: conversão (35%), visitas (35%) e qualidade da plataforma (30%; sem nota, neutra).
      const cScore = ajustada != null && p0 > 0 ? Math.min(1, ajustada / (p0 * 1.5)) : 0.5;
      const vScore = l.visitas != null && medV > 0 ? Math.min(1, l.visitas / (medV * 2)) : 0.5;
      const qScore = l.qualidade ? l.qualidade.nota / 100 : 0.5;
      const saude = l.status === "ativo" ? Math.round(100 * (0.35 * cScore + 0.35 * vScore + 0.3 * qScore)) : 0;
      resultado.push({ ...l, conversao, conversaoAjustada: ajustada, diagnostico: diag, ganho, saude, melhorias: [...(l.qualidade?.acoes ?? []), ...regras(l, diag)] });
    }
    resumo[mp] = {
      anuncios: ls.length,
      ativos: ativos.length,
      visitas: totV,
      vendas: comVisita.length ? totS : ativos.reduce((s, l) => s + l.vendas30, 0),
      conversao: totV > 0 ? p0 : null,
      notaMedia: notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null,
      ganho: Math.round(ganhoTotal * 100) / 100,
      periodo: comVisita[0]?.periodo ?? "",
    };
  }
  return { linhas: resultado.sort((a, b) => b.ganho - a.ganho || a.saude - b.saude), resumo };
}
