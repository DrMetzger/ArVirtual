"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { raioxAnuncios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { gerarComGemini } from "@/lib/gemini";
import { analisarRaioX, coletarRaioX, DIAGNOSTICOS } from "@/lib/raiox";

const estado = globalThis as unknown as { raioxDesde?: number | null };
export async function raioxEmAndamento() {
  const d = estado.raioxDesde;
  return d && Date.now() - d < 20 * 60_000 ? { desde: d } : null;
}

export async function atualizarRaioX() {
  await requireUser();
  if (!(await raioxEmAndamento())) {
    estado.raioxDesde = Date.now();
    void coletarRaioX()
      .catch((e: Error) => console.warn(`[raio-x] ${e.message}`))
      .finally(() => (estado.raioxDesde = null));
  }
  redirect("/marketplaces/raio-x");
}

const NOMES: Record<string, string> = { mercadolivre: "Mercado Livre", shopee: "Shopee", magalu: "Magalu" };

/** Plano da IA para um anúncio: título novo, ordem das ações e o porquê, com os números do raio-x. */
export async function planoIaAnuncio(contaId: number, idExterno: string, voltar: string) {
  await requireUser();
  const todas = await db.select().from(raioxAnuncios);
  const { linhas, resumo } = analisarRaioX(todas);
  const l = linhas.find((x) => x.contaId === contaId && x.idExterno === idExterno);
  if (!l) redirect(voltar);
  const r = resumo[l.marketplace];
  const pct = (n: number | null) => (n == null ? "?" : `${(n * 100).toFixed(2)}%`);
  const prompt = `Você é especialista em vender no ${NOMES[l.marketplace]} (Brasil). A loja vende peças impressas em 3D (marca Sincrolab).
Anúncio: "${l.titulo}" · preço R$ ${l.preco.toFixed(2)} · status ${l.status}
Visitas: ${l.visitas ?? "não informado"} (${l.periodo === "30d" ? "últimos 30 dias" : l.periodo === "total" ? "desde a publicação" : "-"})
Vendas: ${l.periodo === "total" ? `${l.vendasTotal ?? 0} desde a publicação` : `${l.vendas30} nos últimos 30 dias`}
Conversão do anúncio: ${pct(l.conversao)} (ajustada ${pct(l.conversaoAjustada)}) · média da loja nesta plataforma: ${pct(r?.conversao ?? null)}
Fotos: ${l.fotos ?? "?"} · ${l.marketplace === "mercadolivre" ? `Premium: ${l.premium ? "sim" : "não"} · Frete grátis: ${l.freteGratis ? "sim" : "não"} · Qualidade ML: ${l.qualidade ? `${l.qualidade.nota}/100 (${l.qualidade.nivel})` : "?"}` : ""}
Diagnóstico: ${DIAGNOSTICOS[l.diagnostico].nome} · deixa de faturar ~R$ ${l.ganho.toFixed(2)}
Pendências apontadas: ${l.melhorias.join(" | ") || "nenhuma"}

Responda em português, curto e prático (no máximo 12 linhas, markdown):
1. **Título novo** (até ${l.marketplace === "mercadolivre" ? 60 : 120} caracteres, com as palavras que o comprador digita).
2. **Faça nesta ordem**: 3 a 5 ações concretas, a mais importante primeiro, cada uma com o porquê em poucas palavras.
3. **Preço**: se faz sentido mudar e para quanto, considerando o diagnóstico.`;
  let plano: string;
  try {
    plano = await gerarComGemini([{ role: "user", text: prompt }], { temperature: 0.4 });
  } catch (e) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent((e as Error).message)}`);
  }
  await db.update(raioxAnuncios).set({ planoIa: plano.slice(0, 4000) }).where(and(eq(raioxAnuncios.contaId, contaId), eq(raioxAnuncios.idExterno, idExterno)));
  revalidatePath("/marketplaces/raio-x");
  redirect(`${voltar}#a-${contaId}-${idExterno}`);
}
