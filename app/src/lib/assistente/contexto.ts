import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { filamentos, memoriasIa, pedidosMarketplace, produtos } from "@/db/schema";
import { CANAIS } from "@/components/marca";
import { situacaoPedido } from "@/lib/marketplaces/situacao";
import type { Faixa } from "@/lib/precificacao";
import { getParametrosImpressao, getParametrosPreco, getSettings } from "@/lib/settings";

/** Dados técnicos de cada impressora, para a IA não chutar limites da máquina. */
const IMPRESSORAS: Record<string, string> = {
  "Bambu Lab A1 mini":
    "volume 180 × 180 × 180 mm; estrutura aberta (sem câmara: PLA, PETG e TPU vão bem; ABS/ASA/PC empenam e soltam fumaça, não recomendados); bico até 300 °C; mesa até 80 °C; até 500 mm/s e 10.000 mm/s²; calibração automática de mesa, de fluxo e compensação de vibração; AMS lite opcional (4 cores, não aceita TPU nem filamento muito flexível/abrasivo); bico de troca rápida; câmera para timelapse",
  "Bambu Lab A1":
    "volume 256 × 256 × 256 mm; estrutura aberta; bico até 300 °C; mesa até 100 °C; até 500 mm/s; calibração automática; AMS lite opcional (4 cores)",
  "Bambu Lab P1S": "volume 256 × 256 × 256 mm; fechada (aceita ABS/ASA); bico até 300 °C; mesa até 100 °C; até 500 mm/s e 20.000 mm/s²; AMS opcional",
  "Bambu Lab P2S": "volume 256 × 256 × 256 mm; fechada; até 300 °C no bico; AMS 2 Pro opcional",
  "Bambu Lab X1C": "volume 256 × 256 × 256 mm; fechada com filtro; bico de aço endurecido até 300 °C; mesa até 110 °C; lidar; aceita fibras de carbono",
  "Bambu Lab H2D": "dois bicos; fechada com câmara aquecida; volume grande (cerca de 325 × 320 × 325 mm); bico até 350 °C",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const faixasTexto = (f: Faixa[]) =>
  f.map((x) => `${Number.isFinite(x.ate) ? `até ${brl(x.ate)}` : "acima"}: ${x.comissao}%${x.fixa ? ` + ${brl(x.fixa)}` : ""}`).join("; ");

export const MARCA_MEMORIA = /\[\[lembrar:\s*([^\]]+?)\s*\]\]/g;

/** Instruções do assistente com tudo que ele precisa saber da empresa, da impressora e do que já aprendeu. */
export async function montarSistema() {
  const [cfg, emp, custo, preco, fils, prods, mems, pedidos] = await Promise.all([
    getSettings([
      "ia.instrucoes", "ia.aprender", "impressora.modelo", "impressora.quantidade", "impressora.bico", "impressora.mesa", "impressora.ams",
      "impressora.fatiador", "impressora.materiais", "impressora.ambiente", "impressora.observacoes",
    ]),
    db.query.empresa.findFirst(),
    getParametrosImpressao(),
    getParametrosPreco(),
    db.select().from(filamentos).where(eq(filamentos.ativo, true)).orderBy(filamentos.material, filamentos.cor),
    db
      .select({
        sku: produtos.sku, nome: produtos.nome, material: produtos.material, cor: produtos.cor, preco: produtos.preco, custo: produtos.custo,
        estoque: produtos.estoque, filamentoG: produtos.filamentoG, tempo: produtos.tempoImpressaoMin, a: produtos.alturaCm, l: produtos.larguraCm, c: produtos.comprimentoCm,
      })
      .from(produtos)
      .where(and(eq(produtos.ativo, true), eq(produtos.temVariacoes, false)))
      .orderBy(desc(produtos.atualizadoEm))
      .limit(60),
    db.select({ texto: memoriasIa.texto }).from(memoriasIa).where(eq(memoriasIa.ativo, true)).orderBy(desc(memoriasIa.id)).limit(100),
    db
      .select({ marketplace: pedidosMarketplace.marketplace, status: pedidosMarketplace.status, total: pedidosMarketplace.total, itens: pedidosMarketplace.itens })
      .from(pedidosMarketplace)
      .where(and(gte(pedidosMarketplace.data, new Date(Date.now() - 30 * 86400_000)))),
  ]);

  const modelo = cfg["impressora.modelo"] || "Bambu Lab A1 mini";
  const vendidos = pedidos.filter((p) => ["pago", "enviado", "entregue"].includes(situacaoPedido(p.marketplace, p.status)));
  const porCanal = Object.entries(
    vendidos.reduce<Record<string, { n: number; total: number }>>((acc, p) => {
      const c = (acc[p.marketplace] ??= { n: 0, total: 0 });
      c.n++;
      c.total += p.total;
      return acc;
    }, {}),
  ).map(([k, v]) => `${CANAIS[k as keyof typeof CANAIS]?.nome ?? k}: ${v.n} pedido(s), ${brl(v.total)}`);
  const maisVendidos = Object.entries(
    vendidos.flatMap((p) => p.itens).reduce<Record<string, number>>((acc, i) => {
      acc[i.titulo] = (acc[i.titulo] ?? 0) + i.quantidade;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t, q]) => `${q}× ${t}`);

  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }).format(new Date());
  const aprender = cfg["ia.aprender"] !== "nao";

  return `Você é o assistente de IA da ${emp?.nomeFantasia || emp?.razaoSocial || "ArVirtual"} (ArVirtual, pesquisa e desenvolvimento, ${emp?.cidade || "São José do Rio Preto"}/${emp?.uf || "SP"}), dentro do sistema de gestão da empresa.
A empresa vende peças impressas em 3D no Mercado Livre, Shopee, Magalu e na loja própria (Sincrolab), e emite NF-e (${emp?.regime === 3 ? "regime normal" : "Simples Nacional"}).
Hoje é ${hoje}.

Você é especialista em:
- Impressão 3D FDM, em especial na impressora da empresa (abaixo): perfis do ${cfg["impressora.fatiador"] || "Bambu Studio"}, temperaturas, velocidades, altura de camada, paredes, preenchimento, suportes, orientação da peça, mesa, adesão, AMS, secagem de filamento, manutenção e solução de defeitos (stringing, warping, elephant foot, camadas desalinhadas, entupimento, falhas do AMS, códigos de erro HMS).
- Vender impressão 3D: ideias de produtos que vendem, nichos, anúncios (títulos com palavras-chave, descrições, fotos), precificação com as taxas de cada marketplace, kits, variações de cor, embalagem e envio.
- Fiscal (NCM/CFOP/CST/CSOSN, NF-e) — deixe claro quando algo precisa ser confirmado com o contador —, automação com ESP32 e integrações com ERP (TOTVS Protheus/ADVPL).

Como responder:
- Português do Brasil, direto e prático, como um colega experiente. Use listas e tabelas em Markdown quando ajudarem.
- Em dicas de impressão, dê valores concretos para a impressora e o bico configurados (ex.: "PLA Basic: bico 220 °C, mesa 55 °C na Textured PEI, camada 0,20 mm"). Se algo não for possível nessa máquina (tamanho, material), avise e proponha alternativa (dividir a peça, outro material).
- Em preços, faça a conta com o custo real (filamento + energia + embalagem) e as taxas do canal abaixo; mostre o lucro líquido.
- Arquivos anexados (fotos de peças com defeito, prints do fatiador, STL/3MF, G-code, PDFs, planilhas, XML de NF-e) chegam junto da mensagem: analise-os. A análise de STL/3MF é feita pelo sistema e é confiável para medidas e volume.
- Se o usuário pedir uma imagem, diga que ele pode ativar o botão "Criar imagem" na caixa de mensagem (você, no modo texto, não gera imagens).
- Use os dados do sistema abaixo; não invente estoque, vendas ou preços.
${
  aprender
    ? `
MEMÓRIA (aprendizado):
Quando o usuário contar um fato durável sobre a empresa, produtos, fornecedores, impressora, clientes, preferências ou decisões (ex.: "nosso PLA preto é da Voolt3D", "prefiro respostas curtas", "não vendemos mais na Magalu"), acrescente NO FINAL da resposta uma linha para cada fato no formato exato [[lembrar: fato curto e completo]]. Não registre coisas passageiras nem o que já está na memória abaixo. Se o usuário corrigir um fato antigo, registre a versão nova.
`
    : ""
}
=== IMPRESSORA (Configurações › Impressora 3D) ===
${cfg["impressora.quantidade"] && cfg["impressora.quantidade"] !== "1" ? `${cfg["impressora.quantidade"]}× ` : ""}${modelo}${IMPRESSORAS[modelo] ? `: ${IMPRESSORAS[modelo]}` : ""}
Bico: ${cfg["impressora.bico"] || "0,4 mm aço inox (padrão)"} · Mesa: ${cfg["impressora.mesa"] || "Textured PEI"} · Multicor: ${cfg["impressora.ams"] || "AMS lite (4 cores)"} · Fatiador: ${cfg["impressora.fatiador"] || "Bambu Studio"}
Materiais usados: ${cfg["impressora.materiais"] || "não informado"}${cfg["impressora.ambiente"] ? `\nAmbiente: ${cfg["impressora.ambiente"]}` : ""}${cfg["impressora.observacoes"] ? `\nObservações: ${cfg["impressora.observacoes"]}` : ""}

=== CUSTOS E PREÇOS ===
Filamento padrão ${brl(custo.custoFilamentoKg)}/kg · impressora ${custo.potenciaW} W · energia ${brl(custo.custoKwh)}/kWh · lucro desejado ${preco.margem}% sobre o custo · imposto ${preco.imposto}% · embalagem ${brl(preco.embalagem)}/pedido
${(["mercadolivre", "shopee", "magalu", "loja"] as const)
  .map((c) => `${CANAIS[c].nome}: comissão ${faixasTexto(preco.canais[c].faixas)}; campanha ${preco.canais[c].campanha}%; frete pago ${brl(preco.canais[c].frete)}`)
  .join("\n")}

=== FILAMENTOS EM ESTOQUE ===
${fils.length ? fils.map((f) => `${f.material} ${f.cor}${f.marca ? ` (${f.marca})` : ""}: ${(f.saldoG / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg, ${brl(f.custoKg)}/kg`).join("\n") : "Nenhum filamento cadastrado."}

=== PRODUTOS ATIVOS (${prods.length}${prods.length === 60 ? "+, mais recentes" : ""}) ===
${prods.length ? prods.map((p) => `${p.sku} · ${p.nome} · ${[p.material, p.cor].filter(Boolean).join(" ") || "-"} · preço ${brl(p.preco)} · custo ${brl(p.custo)} · estoque ${p.estoque} · ${p.filamentoG} g · ${p.tempo} min${p.a || p.l || p.c ? ` · ${p.c}×${p.l}×${p.a} cm` : ""}`).join("\n") : "Nenhum produto cadastrado."}

=== VENDAS DOS ÚLTIMOS 30 DIAS ===
${porCanal.length ? porCanal.join("\n") : "Sem vendas no período."}${maisVendidos.length ? `\nMais vendidos: ${maisVendidos.join("; ")}` : ""}
${mems.length ? `\n=== MEMÓRIA (o que você já aprendeu nas conversas) ===\n${mems.map((m) => `- ${m.texto}`).join("\n")}` : ""}${cfg["ia.instrucoes"] ? `\n\n=== INSTRUÇÕES DO USUÁRIO (siga sempre) ===\n${cfg["ia.instrucoes"]}` : ""}`;
}

/** Separa as marcações [[lembrar: ...]] do texto da resposta. */
export function extrairMemorias(texto: string) {
  const fatos = [...texto.matchAll(MARCA_MEMORIA)].map((m) => m[1]!.trim()).filter((f) => f.length > 3);
  return { texto: texto.replace(MARCA_MEMORIA, "").trimEnd(), fatos: [...new Set(fatos)] };
}
