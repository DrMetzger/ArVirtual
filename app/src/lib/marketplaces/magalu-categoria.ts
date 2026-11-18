import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categorias, type Produto } from "@/db/schema";
import { gerarComGemini } from "@/lib/gemini";

// Categoria do Magalu escolhida pelo ERP. Sem categoria, o Magalu deduz pelo título (ex.: "suporte de controle PS5" vira
// Games/Eletrônicos) e passa a exigir certificado da Anatel ou do Inmetro, que não se aplica a peça impressa em 3D.
// Aqui: a IA propõe categorias, o ERP busca na API do Magalu, descarta os departamentos regulados e escolhe a mais
// específica; a escolha fica guardada na categoria do catálogo (vale para os próximos produtos dela).

type Chamar = <T>(path: string) => Promise<T>;
type CategoriaMagalu = { id: string; name: string; path: string };

/** Departamentos que pedem certificação/registro (Anatel, Inmetro, Anvisa, Mapa) ou que não são o caso de peça 3D. */
const REGULADOS =
  /eletr[oô]nic|inform[aá]tica|telefon|celular|smartphone|games|videogame|console|brinquedo|beb[eê]|infantil|sa[uú]de|farm[aá]c|m[eé]dic|beleza|perfum|cosm[eé]t|alimento|bebida|mercado|suplement|eletrodom|eletroport|tv e v[ií]deo|[aá]udio|c[aâ]mera|drone|automotivo.*(pneu|[oó]leo|bateria)|cabo|carregador|fonte de alimenta/i;

function lista(r: unknown): CategoriaMagalu[] {
  const arr = Array.isArray(r) ? r : Array.isArray((r as { results?: unknown })?.results) ? (r as { results: unknown[] }).results : [];
  return (arr as Partial<CategoriaMagalu>[]).filter((c) => c.id && c.path).map((c) => ({ id: c.id!, name: c.name ?? "", path: c.path! }));
}

function json<T>(t: string, padrao: T): T {
  try {
    return JSON.parse(t.slice(t.search(/[[{]/), Math.max(t.lastIndexOf("]"), t.lastIndexOf("}")) + 1)) as T;
  } catch {
    return padrao;
  }
}

/** Escolhe (ou reaproveita) a categoria do Magalu para o produto, fora dos departamentos regulados. */
export async function categoriaMagaluPara(chamar: Chamar, produto: Produto): Promise<CategoriaMagalu | null> {
  const cat = produto.categoriaId ? await db.query.categorias.findFirst({ where: eq(categorias.id, produto.categoriaId) }) : null;
  const guardada = cat?.noMarketplace?.magalu;
  if (guardada?.id) return { id: guardada.id, name: guardada.caminho.split("/").pop() ?? "", path: guardada.caminho };

  // 1) A IA propõe nomes de categoria (como o comprador procuraria) para uma peça de plástico impressa em 3D.
  const termos = json<string[]>(
    await gerarComGemini(
      [
        {
          role: "user",
          text:
            `Produto (peça de plástico impressa em 3D, não é eletrônico, não tem bateria nem fio, não é brinquedo infantil):\n` +
            `"${produto.nome}"${cat ? ` — categoria da loja: ${cat.nome}` : ""}\n` +
            `Sugira 5 nomes curtos de categoria de marketplace onde ele deve ser anunciado, SEM usar departamentos regulados ` +
            `(eletrônicos, informática, games/consoles, telefonia, brinquedos, bebês, saúde, beleza, alimentos). Prefira ` +
            `Casa e Decoração, Organização, Utilidades Domésticas, Papelaria, Artesanato, Colecionáveis, Ferramentas, Jardim, Pet. ` +
            `Ex.: para "suporte de controle PS5" → "Suporte Decorativo", "Organizador de Mesa", "Expositor". Responda só JSON: ["...", ...]`,
        },
      ],
      { json: true, temperature: 0.2 },
    ).catch(() => "[]"),
    [] as string[],
  ).filter((t) => typeof t === "string" && t.trim().length >= 3);
  // 2) Busca cada nome na árvore do Magalu e fica só com o que não é regulado.
  const vistos = new Map<string, CategoriaMagalu>();
  for (const t of [...termos.slice(0, 5), "Objeto Decorativo", "Organizador"]) {
    const r = await chamar<unknown>(`/seller/v1/portfolios/categories?name=${encodeURIComponent(t.slice(0, 60))}&_limit=15`).catch((e: Error) => {
      if (/40[13]/.test(e.message)) throw e;
      return [];
    });
    for (const c of lista(r)) if (!REGULADOS.test(c.path) && !vistos.has(c.id)) vistos.set(c.id, c);
  }
  const opcoes = [...vistos.values()].slice(0, 40);
  if (!opcoes.length) return null;
  // 3) A IA escolhe a mais adequada entre as categorias reais do Magalu.
  const n = json<{ n?: number }>(
    await gerarComGemini(
      [
        {
          role: "user",
          text:
            `Qual destas categorias do Magalu é a melhor para anunciar "${produto.nome}" (peça de plástico impressa em 3D)? ` +
            `Evite qualquer uma que peça certificação (Anatel, Inmetro, Anvisa).\n${opcoes.map((c, i) => `${i + 1}. ${c.path}`).join("\n")}\nResponda só JSON: {"n": número}`,
        },
      ],
      { json: true, temperature: 0 },
    ).catch(() => "{}"),
    {},
  ).n;
  const escolhida = opcoes[Number(n) - 1] ?? opcoes[0]!;
  if (cat) {
    await db
      .update(categorias)
      .set({ noMarketplace: { ...cat.noMarketplace, magalu: { id: escolhida.id, caminho: escolhida.path } } })
      .where(eq(categorias.id, cat.id));
  }
  return escolhida;
}

type AtributoMagalu = { name: string; display_name?: string; type?: string; choices?: string[] | null; example?: string | null; required?: string };

/** Campos obrigatórios da ficha técnica da categoria, preenchidos com os dados do produto (a IA ajuda nos que faltam). */
export async function fichaObrigatoria(chamar: Chamar, categoriaId: string, produto: Produto, jaTem: { name: string; value: string }[]) {
  const r = await chamar<unknown>(`/seller/v1/portfolios/categories/${categoriaId}/datasheet?required=required&_limit=50`).catch(() => null);
  const attrs = ((r as { results?: AtributoMagalu[] })?.results ?? []).filter((a) => a.name && !jaTem.some((j) => j.name.toLowerCase() === a.name.toLowerCase()));
  if (!attrs.length) return [];
  const conhecidos: Record<string, string> = {
    material: produto.material || "PLA",
    cor: produto.cor || "Variada",
    marca: "ArVirtual",
    modelo: produto.sku,
    garantia: "3 meses",
    "prazo de garantia": "3 meses",
    origem: "Nacional",
  };
  const valores = json<Record<string, string>>(
    await gerarComGemini(
      [
        {
          role: "user",
          text:
            `Preencha a ficha técnica do Magalu para "${produto.nome}" (peça de plástico ${produto.material || "PLA"} impressa em 3D, ` +
            `${produto.alturaCm}×${produto.larguraCm}×${produto.comprimentoCm} cm, ${produto.pesoG} g, cor ${produto.cor || "variada"}). ` +
            `Para campos que não se aplicam (voltagem, bateria, certificação), use "Não se aplica" ou a opção equivalente da lista.\n` +
            attrs.map((a) => `- ${a.name}${a.choices?.length ? ` (escolha uma: ${a.choices.slice(0, 40).join(" | ")})` : a.example ? ` (ex.: ${a.example})` : ""}`).join("\n") +
            `\nResponda só JSON: {"nome do campo": "valor"}`,
        },
      ],
      { json: true, temperature: 0 },
    ).catch(() => "{}"),
    {} as Record<string, string>,
  );
  return attrs.map((a) => {
    let v = String(valores[a.name] ?? conhecidos[a.name.toLowerCase()] ?? "").trim();
    if (a.choices?.length && !a.choices.includes(v)) {
      v = a.choices.find((c) => c.toLowerCase() === v.toLowerCase()) ?? a.choices.find((c) => /n[aã]o se aplica|outro|n[aã]o/i.test(c)) ?? a.choices[0]!;
    }
    return { name: a.name, value: (v || "Não se aplica").slice(0, 100) };
  });
}
