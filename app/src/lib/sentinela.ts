import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { sentinelaItens, sentinelaLeituras, sentinelaRelatorios, sentinelaTermos, type AnaliseSentinela, type ExtrasAfiliado } from "@/db/schema";
import { afiliadosConfigurado, buscarOfertas, type Oferta } from "@/lib/afiliados";
import { gerarComGemini, gerarComGeminiDetalhado, geminiConfigurado } from "@/lib/gemini";
import { custoImpressao } from "@/lib/impressao";
import { get, produto, tokenML } from "@/lib/pesquisa-mercado";
import { liquido } from "@/lib/precificacao";
import { getParametrosImpressao, getParametrosPreco, getSetting } from "@/lib/settings";

/**
 * Sentinela de mercado. De tempos em tempos lê, para cada termo vigiado:
 * - Shopee (API de afiliados): produtos com vendas, preço, comissão e loja;
 * - Mercado Livre: ranking de mais vendidos da categoria, vendedores que disputam cada produto e menor preço;
 * e guarda cada leitura. A diferença entre leituras é a velocidade: o que está vendendo AGORA, não o histórico.
 * A IA olha os que mais sobem e diz se dá para imprimir, quanto custa e quanto sobra no preço do concorrente.
 */

const TERMOS_POR_RODADA = 30;
/** Lista geral "top performing" da Shopee: serve ao garimpo de afiliados, não ao mercado de impressão 3D. */
export const EM_ALTA = "em alta na Shopee";
const VERSAO_ANALISE = 3;
const MAX_TERMOS_ATIVOS = 80;
let rodando = false;

type Lido = {
  fonte: "shopee" | "mercadolivre";
  idExterno: string;
  lojaId?: string;
  termo: string;
  nome: string;
  imagem: string;
  link: string;
  loja?: string;
  categoria?: string;
  preco: number;
  comissao?: number;
  vendas?: number;
  avaliacao?: number;
  posicao?: number | null;
  vendedores?: number | null;
  extras?: ExtrasAfiliado;
};

const daShopee = (o: Oferta, termo: string): Lido => ({
  fonte: "shopee",
  idExterno: o.itemId,
  lojaId: o.shopId,
  termo,
  nome: o.nome,
  imagem: o.imagem,
  link: o.linkProduto,
  loja: o.loja,
  preco: o.preco,
  comissao: o.comissaoTaxa,
  vendas: o.vendas,
  avaliacao: o.avaliacao,
  extras: {
    comissaoVendedor: o.comissaoVendedor,
    comissaoShopee: o.comissaoShopee,
    comissaoNovo: o.comissaoNovo,
    ofertaDesde: o.ofertaDesde,
    ofertaAte: o.ofertaAte,
    tiposLoja: o.tiposLoja,
    desconto: o.desconto,
    categorias: o.categorias,
  },
});

async function gravar(lidos: Lido[]) {
  if (!lidos.length) return [];
  // O mesmo produto pode vir em dois termos na mesma rodada: fica a primeira leitura.
  const unicos = [...new Map(lidos.map((l) => [`${l.fonte}:${l.idExterno}`, l])).values()];
  const salvos = await db
    .insert(sentinelaItens)
    .values(
      unicos.map((l) => ({
        fonte: l.fonte,
        idExterno: l.idExterno,
        lojaId: l.lojaId ?? "",
        termo: l.termo,
        nome: l.nome.slice(0, 300),
        imagem: l.imagem,
        link: l.link,
        loja: l.loja ?? "",
        categoria: l.categoria ?? "",
        preco: l.preco || 0,
        comissao: l.comissao ?? 0,
        vendas: l.vendas ?? 0,
        avaliacao: l.avaliacao ?? 0,
        posicao: l.posicao ?? null,
        vendedores: l.vendedores ?? null,
        extras: l.extras ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: [sentinelaItens.fonte, sentinelaItens.idExterno],
      set: {
        nome: sql`excluded.nome`,
        imagem: sql`case when excluded.imagem <> '' then excluded.imagem else ${sentinelaItens.imagem} end`,
        link: sql`case when excluded.link <> '' then excluded.link else ${sentinelaItens.link} end`,
        loja: sql`case when excluded.loja <> '' then excluded.loja else ${sentinelaItens.loja} end`,
        categoria: sql`case when excluded.categoria <> '' then excluded.categoria else ${sentinelaItens.categoria} end`,
        preco: sql`excluded.preco`,
        comissao: sql`excluded.comissao`,
        vendas: sql`excluded.vendas`,
        avaliacao: sql`excluded.avaliacao`,
        posicao: sql`excluded.posicao`,
        vendedores: sql`excluded.vendedores`,
        extras: sql`coalesce(excluded.extras, ${sentinelaItens.extras})`,
        vistoEm: sql`now()`,
      },
    })
    .returning({ id: sentinelaItens.id, fonte: sentinelaItens.fonte, idExterno: sentinelaItens.idExterno });
  const porChave = new Map(unicos.map((l) => [`${l.fonte}:${l.idExterno}`, l]));
  await db.insert(sentinelaLeituras).values(
    salvos.map((s) => {
      const l = porChave.get(`${s.fonte}:${s.idExterno}`)!;
      return { itemId: s.id, vendas: l.vendas ?? 0, preco: l.preco || 0, posicao: l.posicao ?? null, vendedores: l.vendedores ?? null };
    }),
  );
  return salvos.map((s) => s.id);
}

/** Velocidade de cada item: vendas por dia (Shopee) ou posições ganhas por dia no ranking (ML), na janela de até 7 dias. */
async function recalcularVelocidade(ids: number[]) {
  if (!ids.length) return;
  await db.execute(sql`
    with janela as (
      select l.item_id,
        (array_agg(l.vendas order by l.em asc))[1] as vendas_ini,
        (array_agg(l.vendas order by l.em desc))[1] as vendas_fim,
        (array_agg(l.posicao order by l.em asc))[1] as pos_ini,
        (array_agg(l.posicao order by l.em desc))[1] as pos_fim,
        extract(epoch from max(l.em) - min(l.em)) / 86400.0 as dias
      from ${sentinelaLeituras} l
      where l.item_id in ${ids} and l.em > now() - interval '7 days'
      group by l.item_id
    )
    update ${sentinelaItens} i set velocidade = case
      when j.dias < 0.25 then 0
      when i.fonte = 'shopee' then greatest(0, (j.vendas_fim - j.vendas_ini)) / j.dias
      else coalesce(j.pos_ini - j.pos_fim, 0) / j.dias
    end
    from janela j where j.item_id = i.id`);
}

async function coletarShopee(termos: string[], erros: string[]) {
  if (!(await afiliadosConfigurado())) return [];
  const ids: number[] = [];
  for (const termo of termos) {
    // Mais vendidos primeiro; se a Shopee recusar a ordenação, cai para a relevância.
    // Foco no mercado de peças impressas em 3D: o termo vai com "3d" na busca.
    const busca = /\b3d\b/i.test(termo) ? termo : `${termo} 3d`;
    const r =
      (await buscarOfertas({ termo: busca, ordem: "vendidos", limite: 50 }).catch(() => null)) ??
      (await buscarOfertas({ termo: busca, limite: 50 }).catch((e: Error) => (erros.push(`Shopee "${busca}": ${e.message}`), null)));
    if (r) ids.push(...(await gravar(r.ofertas.map((o) => daShopee(o, termo)))));
  }
  return ids;
}

async function coletarML(termos: string[], erros: string[]) {
  const token = await tokenML().catch(() => null);
  if (!token) return [];
  const ids: number[] = [];
  const categoriasVistas = new Set<string>();
  for (const termo of termos) {
    try {
      const sugestoes = (await get<{ category_id: string; category_name: string }[]>(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(termo)}&limit=3`, token)) ?? [];
      const cats = [...new Map(sugestoes.map((s) => [s.category_id, s.category_name])).entries()].slice(0, 2);
      for (const [cat, nomeCat] of cats) {
        if (categoriasVistas.has(cat)) continue;
        categoriasVistas.add(cat);
        const [ranking, tendencias] = await Promise.all([
          get<{ content?: { id: string; position: number; type: string }[] }>(`/highlights/MLB/category/${cat}`, token),
          get<{ keyword: string }[]>(`/trends/MLB/${cat}`, token),
        ]);
        // Buscas em alta na categoria viram sugestão de termo (desligado até você ou a IA ligar).
        const novas = (tendencias ?? []).slice(0, 10).map((t) => ({ termo: t.keyword.toLowerCase().slice(0, 80), origem: "tendencia" as const, ativo: false, motivo: `Em alta no ML: ${nomeCat}` }));
        if (novas.length) await db.insert(sentinelaTermos).values(novas).onConflictDoNothing();
        const doCatalogo = (ranking?.content ?? []).filter((c) => c.type === "PRODUCT").slice(0, 20);
        const lidos: Lido[] = [];
        for (const c of doCatalogo) {
          const p = await produto(c.id, token, c.position).catch(() => null);
          if (!p) continue;
          lidos.push({
            fonte: "mercadolivre",
            idExterno: p.id,
            termo,
            nome: p.nome,
            imagem: p.imagem,
            link: p.link,
            categoria: nomeCat,
            preco: p.preco ?? 0,
            posicao: c.position,
            vendedores: p.vendedores ?? null,
          });
        }
        ids.push(...(await gravar(lidos)));
      }
    } catch (e) {
      erros.push(`ML "${termo}": ${(e as Error).message}`);
      if (/expirou|limitou/.test((e as Error).message)) break;
    }
  }
  return ids;
}

/** Uma rodada: os termos há mais tempo sem leitura (todos giram ao longo do dia). */
export async function coletarSentinela() {
  if (rodando) return { termos: 0, itens: 0, erros: ["Já existe uma coleta em andamento."] };
  rodando = true;
  const erros: string[] = [];
  try {
    const termos = await db
      .select({ id: sentinelaTermos.id, termo: sentinelaTermos.termo })
      .from(sentinelaTermos)
      .where(eq(sentinelaTermos.ativo, true))
      .orderBy(sql`${sentinelaTermos.ultimaColeta} asc nulls first`)
      .limit(TERMOS_POR_RODADA);
    const lista = termos.map((t) => t.termo);
    const [shopee, ml] = await Promise.all([coletarShopee(lista, erros), coletarML(lista, erros)]);
    if (termos.length) await db.update(sentinelaTermos).set({ ultimaColeta: new Date() }).where(inArray(sentinelaTermos.id, termos.map((t) => t.id)));
    await recalcularVelocidade([...new Set([...shopee, ...ml])]);
    // Leituras com mais de 60 dias não entram em conta nenhuma.
    await db.delete(sentinelaLeituras).where(lt(sentinelaLeituras.em, new Date(Date.now() - 60 * 86400_000)));
    return { termos: termos.length, itens: shopee.length + ml.length, erros };
  } finally {
    rodando = false;
  }
}

// ---------------------------------------------------------------------------------------------- IA

const PROMPT_ANALISE = (maxCm: number) => `Você é especialista em impressão 3D FDM (Bambu Lab A1 mini, volume útil ${maxCm}x${maxCm}x${maxCm} cm, PLA/PETG) e vende peças impressas em 3D no Magalu, Mercado Livre e Shopee.
Para cada produto da lista (nome e preço que o concorrente cobra), avalie o produto COMO ELE É VENDIDO, não uma versão reinventada:
- "impresso3d": true só se o anúncio é de peça impressa em 3D (o nome cita 3D/impresso, ou é peça plástica tipicamente impressa:
  suporte, organizador, vaso, miniatura, action figure, articulado, chaveiro, topo de bolo, luminária de PLA, peça de reposição, case, encaixe).
- "imprimivel": true só se o MESMO produto sai da A1 mini com qualidade de venda, inteiro em plástico (PLA/PETG), sem precisar de metal, madeira,
  vidro, tecido, planta artificial, glitter, LED/eletrônica, ímã, adesivo industrial, cerâmica ou espelho como parte principal.
  Na dúvida, false. Itens de ferro/aço, madeira/MDF, flores e plantas artificiais, pisca-pisca, ganchos adesivos, roupas, cosméticos,
  eletrônicos, filamento, impressora, kits de bolinhas de vidro/plástico injetado em massa (centenas de peças) = false.
- "maiorCm": maior medida estimada da peça pronta, em cm (pelo nome e pelo tipo de produto).
- "emPartes": true se, passando de ${maxCm} cm, a peça pode ser impressa em partes que encaixam/colam sem perder qualidade de venda.
  Se maiorCm > ${maxCm} e não dá para fazer em partes, "imprimivel" = false.
Para os imprimíveis, estime gramas de filamento e horas de impressão de UMA unidade, como um maker experiente faria.
"ideia": em 1 frase, como fazer MELHOR ou MAIS BARATO que o concorrente (personalização, kit, cor, encaixe, variação). Para não imprimíveis, deixe "".
"risco": em poucas palavras o principal risco (marca registrada/licença, peça frágil, tamanho, concorrência de chinês barato) ou "".
Responda SOMENTE JSON: {"itens":[{"id":número,"impresso3d":bool,"imprimivel":bool,"maiorCm":número,"emPartes":bool,"confianca":0-100,"gramas":número,"horas":número,"ideia":"...","risco":"..."}]}`;

/** Analisa com a IA os que mais sobem e ainda não foram analisados (ou faz mais de 14 dias). */
let analisando = false;
export async function analisarComIa(limite = 120) {
  if (analisando || !(await geminiConfigurado())) return 0;
  analisando = true;
  try {
    return await analisarLote(limite);
  } finally {
    analisando = false;
  }
}

async function analisarLote(limite: number) {
  const pendente = (fonte: "shopee" | "mercadolivre") =>
    and(
      eq(sentinelaItens.fonte, fonte),
      ne(sentinelaItens.termo, EM_ALTA),
      gte(sentinelaItens.vistoEm, new Date(Date.now() - 3 * 86400_000)),
      or(
        isNull(sentinelaItens.analise),
        sql`coalesce((${sentinelaItens.analise}->>'v')::int, 1) < ${VERSAO_ANALISE}`,
        sql`(${sentinelaItens.analise}->>'em')::timestamptz < now() - interval '14 days'`,
      ),
    );
  const campos = { id: sentinelaItens.id, nome: sentinelaItens.nome, preco: sentinelaItens.preco, fonte: sentinelaItens.fonte };
  // Metade para cada fonte: na Shopee manda a venda; no ML (sem número de vendas) manda a posição no ranking.
  const [daShopee_, doML] = await Promise.all([
    db.select(campos).from(sentinelaItens).where(pendente("shopee")).orderBy(desc(sentinelaItens.velocidade), desc(sentinelaItens.vendas)).limit(Math.ceil(limite * 0.6)),
    db.select(campos).from(sentinelaItens).where(pendente("mercadolivre")).orderBy(desc(sentinelaItens.velocidade), asc(sentinelaItens.posicao)).limit(Math.floor(limite * 0.4)),
  ]);
  const candidatos = [...daShopee_, ...doML];
  if (!candidatos.length) return 0;
  const [pi, pp, maxTxt] = await Promise.all([getParametrosImpressao(), getParametrosPreco(), getSetting("impressao.tamanhoMaxCm")]);
  const maxCm = Number(maxTxt.replace(",", ".")) || 17;
  let feitos = 0;
  for (let i = 0; i < candidatos.length; i += 20) {
    const lote = candidatos.slice(i, i + 20);
    const lista = lote.map((c) => `${c.id} | ${c.nome} | R$ ${c.preco.toFixed(2)}`).join("\n");
    let r: { itens?: { id: number; impresso3d?: boolean; maiorCm?: number; emPartes?: boolean; imprimivel: boolean; confianca: number; gramas: number; horas: number; ideia: string; risco: string }[] };
    try {
      r = JSON.parse(await gerarComGemini([{ role: "user", text: `${PROMPT_ANALISE(maxCm)}\n\nProdutos (id | nome | preço):\n${lista}` }], { json: true, temperature: 0.2 }));
    } catch (e) {
      console.warn(`[sentinela] IA: ${(e as Error).message}`);
      break;
    }
    for (const a of r.itens ?? []) {
      const c = lote.find((x) => x.id === Number(a.id));
      if (!c) continue;
      const gramas = Math.max(0, Number(a.gramas) || 0);
      const horas = Math.max(0, Number(a.horas) || 0);
      const maiorCm = Math.max(0, Number(a.maiorCm) || 0);
      // Regra dura do tamanho, mesmo se a IA se distrair: maior que a mesa só vale se der para fazer em partes.
      if (maiorCm > maxCm && !a.emPartes) a.imprimivel = false;
      const custo = a.imprimivel ? custoImpressao(gramas, horas * 60, pi).custo : 0;
      // Margem vendendo no mesmo preço em cada canal; a principal é a do Magalu (onde você mais vende).
      const noCanal = (canal: "magalu" | "mercadolivre" | "shopee") => {
        const l = a.imprimivel && c.preco > 0 ? liquido(c.preco, custo, pp.canais[canal], pp) : { lucro: 0, margem: 0 };
        return { lucro: l.lucro, margem: l.margem };
      };
      const canais = { magalu: noCanal("magalu"), mercadolivre: noCanal("mercadolivre"), shopee: noCanal("shopee") };
      const l = canais.magalu;
      const analise: AnaliseSentinela = {
        v: VERSAO_ANALISE,
        impresso3d: Boolean(a.impresso3d),
        maiorCm,
        emPartes: Boolean(a.emPartes),
        canais,
        imprimivel: Boolean(a.imprimivel),
        confianca: Math.max(0, Math.min(100, Number(a.confianca) || 0)),
        gramas,
        horas,
        custo,
        lucro: l.lucro,
        margem: l.margem,
        ideia: String(a.ideia ?? "").slice(0, 300),
        risco: String(a.risco ?? "").slice(0, 200),
        em: new Date().toISOString(),
      };
      await db.update(sentinelaItens).set({ analise }).where(eq(sentinelaItens.id, c.id));
      feitos++;
    }
  }
  return feitos;
}

/** Dados prontos para a tela e para o relatório. */
export async function painelSentinela() {
  const desde = new Date(Date.now() - 3 * 86400_000);
  // Só o que a IA aprovou como peça impressa em 3D que sai da sua impressora (tamanho incluído).
  const da3d = and(
    ne(sentinelaItens.termo, EM_ALTA),
    sql`coalesce((${sentinelaItens.analise}->>'v')::int, 1) >= ${VERSAO_ANALISE}`,
    sql`(${sentinelaItens.analise}->>'imprimivel')::boolean`,
    sql`(${sentinelaItens.analise}->>'impresso3d')::boolean`,
    sql`(${sentinelaItens.analise}->>'confianca')::int >= 60`,
  );
  const recentes = and(gte(sentinelaItens.vistoEm, desde), da3d);
  const campos = {
    id: sentinelaItens.id,
    fonte: sentinelaItens.fonte,
    idExterno: sentinelaItens.idExterno,
    lojaId: sentinelaItens.lojaId,
    termo: sentinelaItens.termo,
    nome: sentinelaItens.nome,
    imagem: sentinelaItens.imagem,
    link: sentinelaItens.link,
    loja: sentinelaItens.loja,
    categoria: sentinelaItens.categoria,
    preco: sentinelaItens.preco,
    comissao: sentinelaItens.comissao,
    vendas: sentinelaItens.vendas,
    posicao: sentinelaItens.posicao,
    vendedores: sentinelaItens.vendedores,
    velocidade: sentinelaItens.velocidade,
    analise: sentinelaItens.analise,
    primeiraVez: sentinelaItens.primeiraVez,
  };
  const [subindoShopee, subindoML, oportunidades, novos, nichos, termos, ultima, relatorio, totais] = await Promise.all([
    db.select(campos).from(sentinelaItens).where(and(recentes, eq(sentinelaItens.fonte, "shopee"), ne(sentinelaItens.termo, EM_ALTA))).orderBy(desc(sentinelaItens.velocidade), desc(sentinelaItens.vendas)).limit(24),
    db.select(campos).from(sentinelaItens).where(and(recentes, eq(sentinelaItens.fonte, "mercadolivre"))).orderBy(desc(sentinelaItens.velocidade), asc(sentinelaItens.posicao)).limit(24),
    db
      .select(campos)
      .from(sentinelaItens)
      .where(and(recentes, sql`(${sentinelaItens.analise}->>'confianca')::int >= 75`, sql`(${sentinelaItens.analise}->>'margem')::float >= 30`))
      .orderBy(sql`${sentinelaItens.velocidade} * 10 + least(${sentinelaItens.vendas}, 5000) / 50.0 + (${sentinelaItens.analise}->>'margem')::float / 10 desc`)
      .limit(24),
    db.select(campos).from(sentinelaItens).where(and(gte(sentinelaItens.primeiraVez, new Date(Date.now() - 2 * 86400_000)), da3d)).orderBy(desc(sentinelaItens.vendas)).limit(12),
    db.execute<{ termo: string; fonte: string; itens: number; preco_mediano: number; vendas: number; velocidade: number; lojas: number; vendedores: number }>(sql`
      select termo, fonte, count(*)::int as itens,
        coalesce(percentile_cont(0.5) within group (order by preco), 0)::float as preco_mediano,
        coalesce(sum(vendas), 0)::int as vendas, coalesce(sum(velocidade), 0)::float as velocidade,
        count(distinct nullif(loja_id, ''))::int as lojas, coalesce(avg(vendedores), 0)::float as vendedores
      from ${sentinelaItens} where visto_em > ${desde.toISOString()}::timestamptz and termo <> ${EM_ALTA}
        and coalesce((analise->>'v')::int, 1) >= ${VERSAO_ANALISE} and (analise->>'imprimivel')::boolean and (analise->>'impresso3d')::boolean
      group by termo, fonte order by termo`),
    db.select().from(sentinelaTermos).orderBy(desc(sentinelaTermos.ativo), asc(sentinelaTermos.termo)),
    db.select({ em: sql<Date | null>`max(${sentinelaLeituras.em})` }).from(sentinelaLeituras),
    db.query.sentinelaRelatorios.findFirst({ orderBy: desc(sentinelaRelatorios.criadoEm) }),
    db
      .select({
        itens: sql<number>`count(*)::int`,
        leituras: sql<number>`(select count(*) from ${sentinelaLeituras})::int`,
        aprovados: sql<number>`count(*) filter (where ${da3d})::int`,
        naFila: sql<number>`count(*) filter (where ${sentinelaItens.termo} <> ${EM_ALTA} and ${sentinelaItens.vistoEm} > ${desde.toISOString()}::timestamptz and coalesce((${sentinelaItens.analise}->>'v')::int, 0) < ${VERSAO_ANALISE})::int`,
      })
      .from(sentinelaItens),
  ]);
  return { subindoShopee, subindoML, oportunidades, novos, nichos: [...nichos], termos, ultimaColeta: ultima[0]?.em ?? null, relatorio, totais: totais[0] };
}

/** Relatório da IA: plano da semana com os dados do sentinela + pesquisa na internet (datas, modas, lançamentos). */
export async function gerarRelatorio() {
  const p = await painelSentinela();
  const linha = (i: (typeof p.oportunidades)[number]) =>
    `- ${i.nome} (${i.fonte}, R$ ${i.preco.toFixed(2)}${i.fonte === "shopee" ? `, ${i.vendas} vendas, ${i.velocidade.toFixed(1)}/dia` : `, #${i.posicao} no ranking, ${i.vendedores ?? "?"} vendedores`}${i.analise ? `, custo R$ ${i.analise.custo.toFixed(2)}, margem no Magalu ${i.analise.margem.toFixed(0)}%` : ""})`;
  const nichos = p.nichos
    .map((n) => `- ${n.termo} [${n.fonte}]: ${n.itens} produtos, preço mediano R$ ${n.preco_mediano.toFixed(2)}, ${n.fonte === "shopee" ? `${n.vendas} vendas, ${n.lojas} lojas` : `${n.vendedores.toFixed(1)} vendedores por produto`}`)
    .join("\n");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" });
  const meusMagalu = (await campeoesMagalu().catch(() => []))
    .slice(0, 12)
    .map((m) => `- ${m.titulo}: ${m.quantidade} un. em ${m.pedidos} pedido(s), R$ ${m.faturamento.toFixed(2)}`)
    .join("\n");
  const prompt = `Hoje é ${hoje}. Sou fabricante de peças em impressão 3D (Bambu Lab A1 mini, marca Sincrolab) e vendo principalmente no Magalu (minhas melhores taxas), além de Mercado Livre e Shopee. Só me interessa o que eu fabrico na impressora 3D.
Tenho filamento e impressora parados: preciso vender. Abaixo estão os dados REAIS que meu sistema coletou dos marketplaces.

OPORTUNIDADES (imprimíveis, com margem no preço do concorrente):
${p.oportunidades.map(linha).join("\n") || "(ainda sem análise)"}

O QUE MAIS SOBE NA SHOPEE:
${p.subindoShopee.slice(0, 15).map(linha).join("\n")}

RANKING DO MERCADO LIVRE:
${p.subindoML.slice(0, 15).map(linha).join("\n")}

MEUS MAIS VENDIDOS NO MAGALU (últimos 60 dias, meus pedidos reais):
${meusMagalu || "(sem pedidos no período)"}

NICHOS VIGIADOS (demanda x concorrência):
${nichos}

Pesquise também no magazineluiza.com.br quem vende peças parecidas com as minhas e as oportunidades, e por quanto
(o Magalu não tem API, só a sua pesquisa). Pesquise na internet o que está em alta AGORA no Brasil (datas comemorativas das próximas 6 semanas, lançamentos de games/filmes/séries,
modas de decoração e de presente) e cruze com os dados. Entregue, em português, direto ao ponto, sem enrolação:
1. "Fazer esta semana": 5 produtos concretos para imprimir e anunciar já (nome do anúncio sugerido, preço, por que vai vender, em qual marketplace primeiro).
2. "Nichos com pouca concorrência": onde a demanda é boa e há poucos vendedores.
3. "Calendário": datas próximas e o que preparar para cada uma, com antecedência.
4. "Cuidado": o que evitar (marcas registradas, produto que chinês faz mais barato).
Na última linha, escreva exatamente: NOVOS_TERMOS: termo1; termo2; ... (até 10 termos de busca curtos, sem acento, para eu passar a vigiar).`;
  const { texto } = await gerarComGeminiDetalhado([{ role: "user", text: prompt }], { pesquisa: true, temperature: 0.6 });
  const m = texto.match(/NOVOS_TERMOS:\s*(.+)\s*$/im);
  const corpo = texto.replace(/\n?.*NOVOS_TERMOS:.*$/im, "").trim();
  if (m) {
    const ativos = (await db.select({ n: sql<number>`count(*)::int` }).from(sentinelaTermos).where(eq(sentinelaTermos.ativo, true)))[0]?.n ?? 0;
    const novos = m[1]!
      .split(/[;,]/)
      .map((t) => t.trim().toLowerCase().replace(/[."']/g, "").slice(0, 80))
      .filter((t) => t.length >= 3)
      .slice(0, Math.max(0, MAX_TERMOS_ATIVOS - ativos));
    if (novos.length) await db.insert(sentinelaTermos).values(novos.map((termo) => ({ termo, origem: "ia" as const, motivo: "Sugerido pela IA no relatório" }))).onConflictDoNothing();
  }
  const [r] = await db.insert(sentinelaRelatorios).values({ texto: corpo }).returning();
  return r!;
}

/** Rotina automática: coleta a cada 4 horas; IA analisa o que subiu; relatório 1 vez por dia. */
let ultimaRodada = 0;
export async function rotinaSentinela() {
  // Entre as coletas, a IA vai esvaziando a fila (a cada sincronização, de 15 em 15 min).
  if (Date.now() - ultimaRodada < 4 * 3600_000) {
    await analisarComIa(60).catch((e: Error) => console.warn(`[sentinela] IA: ${e.message}`));
    return;
  }
  ultimaRodada = Date.now();
  const r = await coletarSentinela();
  if (r.erros.length) console.warn(`[sentinela] ${r.erros.slice(0, 5).join(" | ")}`);
  await analisarComIa().catch((e: Error) => console.warn(`[sentinela] IA: ${e.message}`));
  const ultimo = await db.query.sentinelaRelatorios.findFirst({ orderBy: desc(sentinelaRelatorios.criadoEm), columns: { criadoEm: true } });
  if (!ultimo || Date.now() - ultimo.criadoEm.getTime() > 24 * 3600_000) await gerarRelatorio().catch((e: Error) => console.warn(`[sentinela] relatório: ${e.message}`));
}

/** Seus mais vendidos no Magalu (pedidos reais dos últimos 60 dias, sem cancelados). */
export async function campeoesMagalu() {
  const linhas = await db.execute<{ titulo: string; sku: string; quantidade: number; faturamento: number; pedidos: number; imagem: string | null; produto_id: string | null }>(sql`
    with vendas as (
      select coalesce(nullif(i->>'sku', ''), i->>'titulo') as chave, coalesce(i->>'sku', '') as sku,
        max(i->>'titulo') as titulo,
        sum((i->>'quantidade')::numeric)::int as quantidade,
        sum((i->>'quantidade')::numeric * (i->>'valorUnitario')::numeric)::float as faturamento,
        count(distinct p.id)::int as pedidos
      from pedidos_marketplace p, jsonb_array_elements(p.itens) i
      where p.marketplace = 'magalu' and p.data > now() - interval '60 days' and p.status <> 'cancelled'
      group by 1, 2
    ),
    -- Produto do item: pelo anúncio vinculado no Magalu (o SKU de lá pode ser outro) e, se não houver, pelo SKU do cadastro.
    ligados as (
      select v.*, coalesce(
        (select a.produto_id from anuncios a where a.marketplace = 'magalu' and lower(a.id_externo) = lower(v.sku) limit 1),
        (select pr.id from produtos pr where lower(pr.sku) = lower(v.sku) limit 1)
      ) as pid
      from vendas v
    )
    select l.titulo, l.sku, l.quantidade, l.faturamento, l.pedidos, l.pid::text as produto_id,
      coalesce(pr.imagens[1], pai.imagens[1]) as imagem
    from ligados l
    left join produtos pr on pr.id = l.pid
    left join produtos pai on pai.id = pr.pai_id
    order by l.quantidade desc, l.faturamento desc limit 30`);
  return [...linhas];
}

const palavrasDe = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && w !== "3d");

/**
 * Quantidade de anúncios: os seus por plataforma (e os produtos ainda sem anúncio em cada uma) e, por nicho,
 * quantos anúncios os líderes têm (pelo que as sentinelas viram na Shopee) contra quantos você tem.
 * As plataformas não informam o total de anúncios de um concorrente; a conta é dentro do nicho.
 */
export async function estatisticaAnuncios() {
  const canais = ["magalu", "mercadolivre", "shopee"] as const;
  const [porStatus, produtosAtivos, publicados, lojas] = await Promise.all([
    db.execute<{ marketplace: string; status: string; n: number }>(sql`select marketplace, status, count(*)::int as n from anuncios group by 1, 2`),
    db.execute<{ id: string; nome: string; imagem: string | null }>(
      sql`select id::text, nome, imagens[1] as imagem from produtos where ativo and pai_id is null order by nome`,
    ),
    // Produto (ou o pai da variação) com anúncio publicado em cada canal.
    db.execute<{ marketplace: string; produto: string }>(sql`
      select distinct a.marketplace, coalesce(p.pai_id, p.id)::text as produto
      from anuncios a join produtos p on p.id = a.produto_id where a.status = 'publicado'`),
    db.execute<{ termo: string; loja_id: string; loja: string; anuncios: number; vendas: number }>(sql`
      select termo, loja_id, max(loja) as loja, count(*)::int as anuncios, coalesce(sum(vendas), 0)::int as vendas
      from ${sentinelaItens}
      where fonte = 'shopee' and termo <> ${EM_ALTA} and loja_id <> '' and visto_em > now() - interval '7 days'
      group by 1, 2`),
  ]);
  const anunciados = new Map<string, Set<string>>(canais.map((c) => [c, new Set()]));
  for (const p of publicados) anunciados.get(p.marketplace)?.add(p.produto);
  const plataformas = canais.map((c) => {
    const st = (s: string) => [...porStatus].filter((x) => x.marketplace === c && x.status === s).reduce((a, x) => a + x.n, 0);
    const sem = [...produtosAtivos].filter((p) => !anunciados.get(c)!.has(p.id));
    return { canal: c, ativos: st("publicado"), pausados: st("pausado"), encerrados: st("encerrado"), comErro: st("erro"), produtos: produtosAtivos.length, semAnuncio: sem };
  });

  // Seus produtos anunciados (em qualquer canal) que batem com as palavras do nicho.
  const meus = [...produtosAtivos].map((p) => ({ ...p, palavras: new Set(palavrasDe(p.nome)), canais: canais.filter((c) => anunciados.get(c)!.has(p.id)) }));
  const porTermo = new Map<string, (typeof lojas)[number][]>();
  for (const l of lojas) porTermo.set(l.termo, [...(porTermo.get(l.termo) ?? []), l]);
  const nichos = [...porTermo.entries()]
    .map(([termo, ls]) => {
      const lideres = [...ls].sort((a, b) => b.vendas - a.vendas).slice(0, 5);
      const media = lideres.length ? lideres.reduce((s, l) => s + l.anuncios, 0) / lideres.length : 0;
      const chave = palavrasDe(termo);
      const seus = meus.filter((p) => chave.length && chave.every((w) => [...p.palavras].some((x) => x.startsWith(w.slice(0, 5)))));
      const porCanal = Object.fromEntries(canais.map((c) => [c, seus.filter((p) => p.canais.includes(c)).length])) as Record<(typeof canais)[number], number>;
      const meta = Math.max(1, Math.ceil(media));
      return { termo, lideres, media, maior: lideres[0] ?? null, seus: seus.length, porCanal, meta, falta: Math.max(0, meta - Math.min(...Object.values(porCanal))) };
    })
    .sort((a, b) => b.falta - a.falta || b.media - a.media);
  return { plataformas, nichos };
}
