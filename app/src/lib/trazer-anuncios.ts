import "server-only";
import { isNull } from "drizzle-orm";
import { db } from "@/db";
import { anuncios, contasMarketplace, produtos, raioxAnuncios, type Marketplace } from "@/db/schema";
import { importarProduto } from "@/lib/importar-produto";
import { adapter, contaComToken } from "@/lib/marketplaces";

/**
 * Trazer para o cadastro os anúncios das plataformas que ainda não estão ligados a nenhum produto do ERP.
 * O mesmo produto em várias plataformas vira UM produto (pelo SKU ou pelo título parecido), e o que já existe
 * no cadastro é só ligado (nunca duplica).
 */
const VAZIAS = new Set(["para", "com", "sem", "de", "do", "da", "dos", "das", "em", "no", "na", "e", "o", "a", "os", "as", "um", "uma", "kit", "3d", "cm", "un", "und"]);
const palavras = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !VAZIAS.has(w)),
  );
function parecido(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let comum = 0;
  for (const w of a) if (b.has(w)) comum++;
  return comum / Math.min(a.size, b.size);
}
const LIMIAR = 0.7;

export type AnuncioSolto = { contaId: number; marketplace: Marketplace; idExterno: string; titulo: string; imagem: string; link: string; preco: number };
export type GrupoTrazer = { chave: string; anuncios: AnuncioSolto[]; principal: AnuncioSolto; existente: { id: string; nome: string } | null };

export async function gruposParaTrazer(): Promise<GrupoTrazer[]> {
  const [todos, ligados, cadastro] = await Promise.all([
    db.select().from(raioxAnuncios),
    db.select({ contaId: anuncios.contaId, idExterno: anuncios.idExterno }).from(anuncios),
    db.select({ id: produtos.id, nome: produtos.nome, sku: produtos.sku }).from(produtos).where(isNull(produtos.paiId)),
  ]);
  const ja = new Set(ligados.map((l) => `${l.contaId}:${(l.idExterno ?? "").toLowerCase()}`));
  const soltos: AnuncioSolto[] = todos
    .filter((t) => !ja.has(`${t.contaId}:${t.idExterno.toLowerCase()}`))
    .map((t) => ({ contaId: t.contaId, marketplace: t.marketplace as Marketplace, idExterno: t.idExterno, titulo: t.titulo, imagem: t.imagem, link: t.link, preco: t.preco }));
  // Agrupa o mesmo produto entre plataformas (título parecido).
  const grupos: { p: Set<string>; itens: AnuncioSolto[] }[] = [];
  for (const a of soltos) {
    const pa = palavras(a.titulo);
    const g = grupos.find((x) => !x.itens.some((i) => i.contaId === a.contaId) && parecido(x.p, pa) >= LIMIAR);
    if (g) g.itens.push(a);
    else grupos.push({ p: pa, itens: [a] });
  }
  const cad = cadastro.map((c) => ({ ...c, p: palavras(c.nome) }));
  // O anúncio mais completo vira a fonte: ML (mais fotos e ficha), depois Magalu, depois Shopee.
  const ordem: Record<string, number> = { mercadolivre: 0, magalu: 1, shopee: 2 };
  return grupos.map((g) => {
    const principal = [...g.itens].sort((x, y) => (ordem[x.marketplace] ?? 9) - (ordem[y.marketplace] ?? 9))[0]!;
    const igual = cad.map((c) => ({ c, s: parecido(c.p, g.p) })).sort((x, y) => y.s - x.s)[0];
    return {
      chave: `${principal.contaId}:${principal.idExterno}`,
      anuncios: g.itens,
      principal,
      existente: igual && igual.s >= LIMIAR ? { id: igual.c.id, nome: igual.c.nome } : null,
    };
  });
}

// ------------------------------------------------------------------------------- trabalho em segundo plano
type Estado = { desde: number; total: number; feitos: number; atual: string; criados: { id: string; nome: string }[]; ligados: number; erros: string[]; fim?: number };
const g = globalThis as unknown as { trazer?: Estado | null };
export const estadoTrazer = () => g.trazer ?? null;

async function ligar(produtoId: string, a: AnuncioSolto) {
  await db
    .insert(anuncios)
    .values({ produtoId, contaId: a.contaId, marketplace: a.marketplace, idExterno: a.idExterno, link: a.link, status: "publicado", preco: a.preco, mensagem: "Ligado ao trazer os anúncios dos marketplaces" })
    .onConflictDoNothing();
}

export function trazerGrupos(chaves: string[]) {
  if (g.trazer && !g.trazer.fim) return false;
  g.trazer = { desde: Date.now(), total: chaves.length, feitos: 0, atual: "", criados: [], ligados: 0, erros: [] };
  const est = g.trazer;
  void (async () => {
    const grupos = (await gruposParaTrazer()).filter((x) => chaves.includes(x.chave));
    est.total = grupos.length;
    const contas = new Map((await db.select().from(contasMarketplace)).map((c) => [c.id, c]));
    for (const grupo of grupos) {
      const p = grupo.principal;
      est.atual = p.titulo;
      try {
        let produtoId = grupo.existente?.id;
        if (!produtoId) {
          const conta = contas.get(p.contaId);
          if (!conta) throw new Error("conta desconectada");
          // Lê o anúncio pela conta dona (Magalu: pelo SKU; ML e Shopee: pelo link do anúncio).
          const dados = await adapter(conta.marketplace).importar?.(await contaComToken(conta), conta.marketplace === "magalu" ? p.idExterno : p.link);
          if (!dados) throw new Error("a plataforma não devolveu o anúncio");
          const it = importarProduto(p.link || p.idExterno, process.env.APP_URL ?? "", { ...dados, idExterno: dados.idExterno ?? p.idExterno }, { id: conta.id, marketplace: conta.marketplace });
          for (;;) {
            const r = await it.next();
            if (r.done) {
              produtoId = r.value.id;
              est.criados.push({ id: r.value.id, nome: r.value.nome });
              break;
            }
          }
        }
        for (const a of grupo.anuncios) {
          if (!grupo.existente && a === p) continue; // o importador já ligou o anúncio de origem
          await ligar(produtoId!, a);
          est.ligados++;
        }
        if (!grupo.existente) est.ligados++;
      } catch (e) {
        est.erros.push(`${p.titulo.slice(0, 50)}: ${(e as Error).message.slice(0, 120)}`);
      }
      est.feitos++;
    }
    est.atual = "";
    est.fim = Date.now();
  })();
  return true;
}
