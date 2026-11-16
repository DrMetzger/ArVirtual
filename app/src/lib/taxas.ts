import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categorias,
  contasMarketplace,
  contratosTaxas,
  produtos,
  type ContratoExtraido,
  type TaxaCategoria,
  type TaxasDaCategoria,
} from "@/db/schema";
import { gerarComGemini } from "@/lib/gemini";
import { adapter, contaComToken } from "@/lib/marketplaces";
import type { AjusteCategoria } from "@/lib/precificacao";
import { getSetting, setSetting } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/uploads";

// Taxas de cada plataforma por categoria do catálogo:
// - Magalu (e qualquer plataforma com contrato): o contrato em PDF é lido pela IA (comissão por categoria + taxa fixa) e
//   cada categoria do catálogo é ligada à categoria do contrato que mais combina.
// - Mercado Livre: a própria API informa a comissão da categoria (domain_discovery + listing_prices).
// - Shopee: tabela por faixa de preço, igual para todas as categorias.
// Tudo automático; o que for escolhido à mão (origem "manual") nunca é sobrescrito.

export type MarketplaceTaxa = "mercadolivre" | "shopee" | "magalu" | "tiktok";
export const PLATAFORMAS_TAXA: MarketplaceTaxa[] = ["magalu", "mercadolivre", "shopee", "tiktok"];
/** Contratos ficam fora da pasta pública de uploads (têm dados da empresa). */
const PASTA_CONTRATOS = `${UPLOAD_DIR}/contratos`;

/** Categoria que a automação já tentou e não achou (IA sem resposta, ML sem sugestão): espera 1 dia para tentar de novo. */
const tentado = new Map<string, number>();
const esperar = (chave: string) =>
  Date.now() - (tentado.get(chave) ?? 0) < 86400_000;

const sem = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const num = (v: unknown) => {
  const n = Number(
    String(v ?? "")
      .replace("%", "")
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : NaN;
};

function json<T>(texto: string): T | null {
  try {
    return JSON.parse(
      texto.slice(
        texto.search(/[[{]/),
        Math.max(texto.lastIndexOf("}"), texto.lastIndexOf("]")) + 1,
      ),
    ) as T;
  } catch {
    return null;
  }
}

/** Valida o que a IA devolveu (porcentagens e valores plausíveis). */
function normalizarContrato(
  bruto: Partial<ContratoExtraido> | null,
): ContratoExtraido {
  if (!bruto)
    throw new Error(
      "A IA não conseguiu ler o contrato. Tente de novo ou envie um PDF com texto (não escaneado).",
    );
  const pct = (v: unknown) => {
    const n = num(v);
    return n >= 0 && n <= 60 ? n : NaN;
  };
  const reais = (v: unknown) => {
    const n = num(v);
    return n >= 0 && n <= 200 ? n : NaN;
  };
  const categorias = (bruto.categorias ?? [])
    .map((c) => ({
      nome: String(c?.nome ?? "")
        .trim()
        .slice(0, 120),
      comissao: pct(c?.comissao),
      fixa:
        c?.fixa === undefined || c?.fixa === null ? undefined : reais(c.fixa),
    }))
    .filter((c) => c.nome && Number.isFinite(c.comissao))
    .map((c) => ({ ...c, fixa: Number.isFinite(c.fixa) ? c.fixa : undefined }));
  const faixas = (bruto.faixas ?? [])
    .map((f) => ({
      ate: f?.ate === null || f?.ate === undefined ? null : num(f.ate),
      comissao: pct(f?.comissao),
      fixa: reais(f?.fixa ?? 0),
    }))
    .filter(
      (f) =>
        Number.isFinite(f.comissao) &&
        Number.isFinite(f.fixa) &&
        (f.ate === null || Number.isFinite(f.ate)),
    );
  // Padrão: o que a IA disse ou, se faltar, a comissão mais comum entre as categorias.
  const comum = (() => {
    const cont = new Map<number, number>();
    for (const c of categorias)
      cont.set(c.comissao, (cont.get(c.comissao) ?? 0) + 1);
    return [...cont].sort((a, b) => b[1] - a[1])[0]?.[0];
  })();
  const comissao = pct(bruto.padrao?.comissao);
  const padrao = {
    comissao: Number.isFinite(comissao)
      ? comissao
      : (comum ?? faixas.at(-1)?.comissao ?? NaN),
    fixa: Number.isFinite(reais(bruto.padrao?.fixa))
      ? reais(bruto.padrao?.fixa)
      : 0,
    fixaAPartirDe: Number.isFinite(reais(bruto.padrao?.fixaAPartirDe))
      ? reais(bruto.padrao?.fixaAPartirDe)
      : 0,
  };
  if (!Number.isFinite(padrao.comissao) && !faixas.length)
    throw new Error(
      "Não achei a comissão no documento. Confira se é o anexo de preços/tarifas.",
    );
  return {
    padrao: {
      ...padrao,
      comissao: Number.isFinite(padrao.comissao) ? padrao.comissao : 0,
    },
    faixas: faixas.length ? faixas : undefined,
    categorias,
    observacoes: (bruto.observacoes ?? [])
      .map((o) => String(o).slice(0, 300))
      .filter(Boolean)
      .slice(0, 12),
  };
}

/** A IA destrincha o contrato (PDF ou imagem) da plataforma. */
async function extrairContrato(
  dados: Buffer,
  mime: string,
  marketplace: MarketplaceTaxa,
): Promise<ContratoExtraido> {
  const texto = await gerarComGemini(
    [
      {
        role: "user",
        partes: [
          { inlineData: { mimeType: mime, data: dados.toString("base64") } },
        ],
        text:
          `Este é o contrato/tabela de tarifas de um vendedor no marketplace ${marketplace}. Extraia SÓ as taxas cobradas do vendedor por venda.\n` +
          `Responda só JSON:\n` +
          `{"padrao": {"comissao": % da maioria das categorias, "fixa": taxa fixa por item em R$ da maioria (0 se não houver), "fixaAPartirDe": preço mínimo do produto para a taxa fixa valer (0 se sempre)},\n` +
          ` "faixas": [{"ate": limite do preço do item em R$ (null na última), "comissao": %, "fixa": R$}] (só se a comissão variar pelo PREÇO do item; senão []),\n` +
          ` "categorias": [{"nome": nome exato da categoria, "comissao": %, "fixa": R$ por item dessa categoria}] (todas as categorias listadas),\n` +
          ` "observacoes": ["regras importantes em uma frase cada: exceções, condições, quando a taxa muda"]}\n` +
          `Use números (18.5, não "18,5%"). Não inclua dados bancários, CNPJ, nomes ou endereços.`,
      },
    ],
    { json: true, temperature: 0 },
  );
  return normalizarContrato(json<Partial<ContratoExtraido>>(texto));
}

/** Converte o contrato nas faixas da precificação ("9.99:18%; *:18%+5"). */
export function faixasDoContrato(c: ContratoExtraido) {
  if (c.faixas?.length) {
    // Sem a faixa final "*", a leitura das faixas repete a última.
    return c.faixas
      .map(
        (f) =>
          `${f.ate === null ? "*" : f.ate}:${f.comissao}%${f.fixa ? `+${f.fixa}` : ""}`,
      )
      .join("; ");
  }
  const { comissao, fixa, fixaAPartirDe } = c.padrao;
  if (!fixa) return `*:${comissao}%`;
  return fixaAPartirDe > 0
    ? `${Math.round((fixaAPartirDe - 0.01) * 100) / 100}:${comissao}%; *:${comissao}%+${fixa}`
    : `*:${comissao}%+${fixa}`;
}

/** Recebe o contrato da tela: guarda o arquivo (privado), a IA lê, as taxas e as categorias se ajustam sozinhas. */
export async function salvarContrato(
  marketplace: MarketplaceTaxa,
  arquivo: File,
) {
  const mime = arquivo.type || "application/pdf";
  if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(mime))
    throw new Error("Envie o contrato em PDF ou imagem (PNG/JPG).");
  if (arquivo.size > 15 * 1024 * 1024)
    throw new Error("Arquivo grande demais (máx. 15 MB).");
  const dados = Buffer.from(await arquivo.arrayBuffer());
  await mkdir(PASTA_CONTRATOS, { recursive: true });
  const caminho = `${PASTA_CONTRATOS}/${marketplace}-${randomBytes(6).toString("hex")}.${mime === "application/pdf" ? "pdf" : mime.split("/")[1]}`;
  await writeFile(caminho, dados);
  const base = {
    marketplace,
    nomeArquivo: arquivo.name.slice(0, 200),
    arquivo: caminho,
    atualizadoEm: new Date(),
  };
  try {
    const extraido = await extrairContrato(dados, mime, marketplace);
    await db
      .insert(contratosTaxas)
      .values({ ...base, extraido, erro: "" })
      .onConflictDoUpdate({
        target: contratosTaxas.marketplace,
        set: { ...base, extraido, erro: "" },
      });
    await aplicarContrato(marketplace, extraido);
    return extraido;
  } catch (e) {
    const erro = (e as Error).message.slice(0, 300);
    await db
      .insert(contratosTaxas)
      .values({ ...base, erro })
      .onConflictDoUpdate({
        target: contratosTaxas.marketplace,
        set: {
          nomeArquivo: base.nomeArquivo,
          arquivo: base.arquivo,
          erro,
          atualizadoEm: new Date(),
        },
      });
    throw e;
  }
}

/** Contrato novo vale na hora: faixas da precificação e as categorias religadas (menos as escolhidas à mão). */
async function aplicarContrato(
  marketplace: MarketplaceTaxa,
  c: ContratoExtraido,
) {
  await setSetting(
    `${marketplace}.faixas` as "magalu.faixas",
    faixasDoContrato(c),
  );
  await mapearCategorias(marketplace, true);
}

/**
 * Liga cada categoria do catálogo à categoria do contrato que mais combina (a IA olha o nome e exemplos de produtos).
 * `todas`: refaz também as já ligadas pelo contrato (contrato novo); sem isso, só as que faltam.
 */
export async function mapearCategorias(
  marketplace: MarketplaceTaxa,
  todas = false,
) {
  const [contrato] = await db
    .select()
    .from(contratosTaxas)
    .where(eq(contratosTaxas.marketplace, marketplace));
  const ex = contrato?.extraido;
  if (!ex?.categorias.length) return 0;
  const cats = await db
    .select()
    .from(categorias)
    .orderBy(asc(categorias.ordem));
  const alvo = cats.filter(
    (c) =>
      c.taxas[marketplace]?.origem !== "manual" &&
      (todas || (!c.taxas[marketplace] && !esperar(`${marketplace}-${c.id}`))),
  );
  if (!alvo.length) return 0;
  for (const c of alvo) tentado.set(`${marketplace}-${c.id}`, Date.now());
  const exemplos = await db
    .select({ cat: produtos.categoriaId, nome: produtos.nome })
    .from(produtos)
    .where(
      and(
        isNull(produtos.paiId),
        sql`${produtos.categoriaId} in (${sql.join(
          alvo.map((c) => sql`${c.id}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(300);
  const texto = await gerarComGemini(
    [
      {
        role: "user",
        text:
          `Categorias do contrato do marketplace ${marketplace}:\n${ex.categorias.map((c) => `- ${c.nome}`).join("\n")}\n\n` +
          `Para cada categoria da minha loja (peças impressas em 3D), diga em qual categoria do contrato os produtos dela são anunciados.\n` +
          alvo
            .map((c, i) => {
              const ex2 = exemplos
                .filter((p) => p.cat === c.id)
                .slice(0, 4)
                .map((p) => p.nome);
              return `${i + 1}. ${c.nome}${ex2.length ? ` (ex.: ${ex2.join("; ")})` : ""}`;
            })
            .join("\n") +
          `\n\nResponda só JSON: [{"n": número, "categoria": "nome exato da categoria do contrato"}]`,
      },
    ],
    { json: true, temperature: 0.1 },
  );
  const resp = json<
    | { n?: number; categoria?: string }[]
    | { itens?: { n?: number; categoria?: string }[] }
  >(texto);
  const lista = Array.isArray(resp) ? resp : (resp?.itens ?? []);
  const porNome = new Map(ex.categorias.map((c) => [sem(c.nome), c]));
  let feitos = 0;
  for (const r of lista) {
    const cat = alvo[Number(r.n) - 1];
    const doContrato = porNome.get(sem(String(r.categoria ?? "")));
    if (!cat || !doContrato) continue;
    const taxa: TaxaCategoria = {
      categoria: doContrato.nome,
      comissao: doContrato.comissao,
      ...(doContrato.fixa !== undefined ? { fixa: doContrato.fixa } : {}),
      origem: "contrato",
    };
    await gravarTaxa(cat.id, marketplace, taxa);
    feitos++;
  }
  return feitos;
}

async function gravarTaxa(
  categoriaId: number,
  marketplace: MarketplaceTaxa,
  taxa: TaxaCategoria | null,
) {
  await db
    .update(categorias)
    .set({
      taxas: taxa
        ? sql`${categorias.taxas} || ${JSON.stringify({ [marketplace]: taxa })}::jsonb`
        : sql`${categorias.taxas} - ${marketplace}`,
      atualizadoEm: new Date(),
    })
    .where(eq(categorias.id, categoriaId));
}

/** Escolha manual na tela (categoria do contrato) ou volta ao automático (`null`). */
export async function escolherTaxa(
  categoriaId: number,
  marketplace: MarketplaceTaxa,
  categoriaContrato: string | null,
) {
  if (!categoriaContrato) {
    await gravarTaxa(categoriaId, marketplace, null);
    tentado.delete(`${marketplace}-${categoriaId}`);
    if (marketplace === "mercadolivre") await tarifasMercadoLivre();
    else await mapearCategorias(marketplace);
    return;
  }
  const [contrato] = await db
    .select()
    .from(contratosTaxas)
    .where(eq(contratosTaxas.marketplace, marketplace));
  const c = contrato?.extraido?.categorias.find(
    (x) => x.nome === categoriaContrato,
  );
  if (!c) throw new Error("Categoria não encontrada no contrato.");
  await gravarTaxa(categoriaId, marketplace, {
    categoria: c.nome,
    comissao: c.comissao,
    ...(c.fixa !== undefined ? { fixa: c.fixa } : {}),
    origem: "manual",
  });
}

/** Comissão real de cada categoria no Mercado Livre, pela API (usa um produto da categoria como exemplo). */
export async function tarifasMercadoLivre(refazer = false) {
  const [conta] = await db
    .select()
    .from(contasMarketplace)
    .where(eq(contasMarketplace.marketplace, "mercadolivre"))
    .limit(1);
  const a = adapter("mercadolivre");
  if (!conta || !a.tarifa) return 0;
  const token = await contaComToken(conta);
  const cats = (await db.select().from(categorias)).filter(
    (c) =>
      c.taxas.mercadolivre?.origem !== "manual" &&
      (refazer || (!c.taxas.mercadolivre && !esperar(`mercadolivre-${c.id}`))),
  );
  let feitos = 0;
  for (const c of cats) {
    const [exemplo] = await db
      .select({ nome: produtos.nome })
      .from(produtos)
      .where(and(eq(produtos.categoriaId, c.id), isNull(produtos.paiId)))
      .orderBy(asc(produtos.criadoEm))
      .limit(1);
    tentado.set(`mercadolivre-${c.id}`, Date.now());
    const t = await a.tarifa(token, exemplo?.nome ?? c.nome).catch(() => null);
    if (!t) continue;
    await gravarTaxa(c.id, "mercadolivre", {
      categoria: t.categoria,
      comissao: t.classico,
      comissaoPremium: t.premium,
      origem: "api",
    });
    feitos++;
  }
  return feitos;
}

/** Ajuste de taxa de cada categoria, pronto para a precificação (ML: clássico ou premium, conforme Configurações). */
export async function ajustesPorCategoria(): Promise<
  Record<number, AjusteCategoria>
> {
  const [cats, tipoML] = await Promise.all([
    db.select({ id: categorias.id, taxas: categorias.taxas }).from(categorias),
    getSetting("mercadolivre.tipoAnuncio"),
  ]);
  return Object.fromEntries(
    cats.map((c) => {
      const t: TaxasDaCategoria = c.taxas;
      const ml = t.mercadolivre;
      return [
        c.id,
        {
          ...(t.magalu
            ? {
                magalu: {
                  comissao: t.magalu.comissao,
                  fixa: t.magalu.fixa,
                  categoria: t.magalu.categoria,
                },
              }
            : {}),
          ...(ml
            ? {
                mercadolivre: {
                  comissao:
                    tipoML === "premium" && ml.comissaoPremium
                      ? ml.comissaoPremium
                      : ml.comissao,
                  categoria: ml.categoria,
                },
              }
            : {}),
        },
      ];
    }),
  );
}

/** Rotina (a cada sincronização): liga as categorias novas aos contratos e busca a tarifa do ML das que faltam. */
let rodando = false;
export async function rotinaTaxas() {
  if (rodando) return;
  rodando = true;
  try {
    for (const m of PLATAFORMAS_TAXA)
      await mapearCategorias(m).catch((e: Error) =>
        console.warn(`[taxas] ${m}: ${e.message.slice(0, 120)}`),
      );
    await tarifasMercadoLivre().catch((e: Error) =>
      console.warn(`[taxas] mercadolivre: ${e.message.slice(0, 120)}`),
    );
  } finally {
    rodando = false;
  }
}
