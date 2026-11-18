import "server-only";
import type { CanalMercado, MercadoCanal } from "@/db/schema";
import { pesquisarConcorrencia, resumir, type Anuncio } from "@/lib/concorrencia";
import { liquido, precosPorCanal, type ParametrosPreco } from "@/lib/precificacao";

// Preço pelo mercado: o que os concorrentes cobram em cada plataforma decide o preço, e o custo só põe o chão.
// - Com concorrentes: um pouco abaixo da mediana (3%), se ainda sobrar o lucro mínimo e respeitar o preço mínimo.
// - Sem como competir (a mediana não paga o seu mínimo) ou sem concorrentes: o sugerido (lucro desejado e mínimos).
// - Loja própria (sem taxas): 5% abaixo da plataforma mais barata, sem passar dos mínimos.

export const CANAIS_MERCADO: CanalMercado[] = ["magalu", "mercadolivre", "shopee"];

/** Preço "bonito" um pouco abaixo da mediana (ex.: 28,90). */
const abaixoDe = (v: number) => Math.max(0, Math.floor(v * 0.97) - 0.1);

export type PrecoMercado = { mercado: Partial<Record<CanalMercado, MercadoCanal>>; precos: Partial<Record<CanalMercado | "loja", number>>; erros: string[] };

export function calcularMercado(r: Record<CanalMercado, Anuncio[]>, custo: number, pp: ParametrosPreco): Omit<PrecoMercado, "erros"> {
  const sugeridos = custo > 0 ? precosPorCanal(custo, 0, pp) : [];
  const mercado: Partial<Record<CanalMercado, MercadoCanal>> = {};
  const precos: Partial<Record<CanalMercado | "loja", number>> = {};
  for (const c of CANAIS_MERCADO) {
    const lista = r[c] ?? [];
    const res = resumir(lista, c === "shopee");
    const s = sugeridos.find((x) => x.canal === c);
    let concorrer: number | null = null;
    let lucro: number | null = null;
    if (res.mediana > 0 && s && custo > 0) {
      const alvo = Math.round(abaixoDe(res.mediana) * 100) / 100;
      const l = liquido(alvo, custo, pp.canais[c], pp);
      if (l.lucro >= (pp.lucroMinimo ?? 0) && l.lucro > 0 && alvo >= (pp.precoMinimo ?? 0)) {
        concorrer = alvo;
        lucro = l.lucro;
      }
    }
    mercado[c] = {
      anuncios: res.anuncios,
      vendedores: res.vendedores,
      min: res.min,
      mediana: res.mediana,
      max: res.max,
      vendas: res.vendas,
      concorrer,
      lucro,
      minimo: s?.minimo ?? 0,
      sugerido: s?.sugerido ?? 0,
      top: lista.slice(0, 3).map((a) => ({ produto: a.produto.slice(0, 120), preco: a.preco, vendas: a.vendas, link: a.link, vendedor: a.vendedor })),
    };
    if (s) precos[c] = concorrer ?? s.sugerido;
  }
  const loja = sugeridos.find((x) => x.canal === "loja");
  const maisBarata = Math.min(...CANAIS_MERCADO.map((c) => precos[c] ?? Infinity));
  if (loja) precos.loja = Math.max(loja.sugerido, Number.isFinite(maisBarata) ? Math.floor(maisBarata * 0.95) + 0.9 : 0);
  return { mercado, precos };
}

/** Pesquisa os concorrentes pelo nome do produto e devolve o mercado e o preço de cada plataforma. */
export async function precoDeMercado(nome: string, custo: number, pp: ParametrosPreco): Promise<PrecoMercado> {
  const r = await pesquisarConcorrencia(nome);
  return { ...calcularMercado(r, custo, pp), erros: r.erros.filter((e) => !/Filtro da IA/.test(e)) };
}
