import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { produtos, type OrigemModelo3d } from "@/db/schema";
import { maisParecido, tempoPeloPeso } from "@/lib/cores-filamento";
import { listaFilamentos } from "@/lib/filamentos";
import { custoComposicao, gramasTotais } from "@/lib/impressao";
import { encaixe, listaImpressoras } from "@/lib/impressoras";
import { importarProduto } from "@/lib/importar-produto";
import { emPortugues, fonteDoLink, lerModeloDoLink, type Modelo3d } from "@/lib/modelos3d";
import { precosPorCanal } from "@/lib/precificacao";
import { getParametrosImpressao, getParametrosPreco } from "@/lib/settings";

// Cria o produto a partir de um modelo 3D (um por vez na tela, ou vários de uma vez no "Cadastrar tudo").
// O mesmo modelo nunca vira dois produtos: a chave fonte:id fica gravada em produtos.modelo3d.

/** "makerworld:22508", "printables:3161"... (vazio para arquivo sem link). */
export function chaveModelo(link: string) {
  const f = fonteDoLink(link);
  return f ? `${f.fonte}:${f.id}` : "";
}

/** Produto já cadastrado a partir deste modelo (pela chave ou pelo link). */
export async function produtoDoModelo(link: string) {
  const chave = chaveModelo(link);
  if (!chave && !link) return null;
  const [p] = await db
    .select({ id: produtos.id, nome: produtos.nome })
    .from(produtos)
    .where(chave ? sql`${produtos.modelo3d}->>'chave' = ${chave} or ${produtos.modelo3d}->>'link' = ${link}` : sql`${produtos.modelo3d}->>'link' = ${link}`)
    .limit(1);
  return p ?? null;
}

export type EscolhaCadastro = {
  perfilId: string | null;
  cores: { filamentoId: number | null; gramas: number }[];
  tempoMin: number;
  licencaPropria: boolean;
};

export async function criarProdutoDoModelo(m: Modelo3d, e: EscolhaCadastro, origin: string): Promise<{ id: string; nome: string }> {
  if (m.link) {
    const existe = await produtoDoModelo(m.link);
    if (existe) throw new Error(`Este modelo já está cadastrado: ${existe.nome}.`);
  }
  const perfil = m.perfis.find((p) => p.id === e.perfilId) ?? null;
  const [maquinas, fils, pi, pp] = await Promise.all([listaImpressoras(), listaFilamentos(), getParametrosImpressao(), getParametrosPreco()]);
  const cabe = maquinas.filter(
    (i) => encaixe(i, { medidasMm: m.medidasMm, cores: perfil ? new Set(perfil.filamentos.map((f) => f.cor)).size : undefined, compativeis: perfil?.compativeis }).cabe !== false,
  );
  const composicao = e.cores.filter((c) => c.gramas > 0 || c.filamentoId).map((c) => ({ filamentoId: c.filamentoId, gramas: Math.max(0, Math.round(c.gramas)) }));
  const tempoMin = Math.max(0, Math.round(e.tempoMin));
  // Energia pela impressora que vai imprimir (a primeira em que cabe).
  const custo = custoComposicao(composicao, tempoMin, { ...pi, potenciaW: cabe[0]?.potenciaW ?? pi.potenciaW }, fils).custo;
  const sugeridos = custo > 0 ? precosPorCanal(custo, 0, pp) : [];
  const preco = sugeridos.find((s) => s.canal === "loja")?.sugerido ?? 0;
  const medidasCm = m.medidasMm ? m.medidasMm.map((v) => Math.round(v) / 10) : null;
  const it = importarProduto(m.link || m.titulo, process.env.APP_URL ?? origin, {
    titulo: m.titulo,
    descricao: m.descricao,
    fotos: m.fotos,
    videos: [],
    preco,
    pesoG: Math.round(gramasTotais(composicao) || perfil?.pesoG || m.pesoEstimadoG || 0),
    ...(medidasCm ? { larguraCm: medidasCm[0], comprimentoCm: medidasCm[1], alturaCm: medidasCm[2] } : {}),
    link: m.link,
  });
  let criado: { id: string; nome: string } | null = null;
  for (;;) {
    const r = await it.next();
    if (r.done) {
      criado = r.value;
      break;
    }
  }
  const principal = fils.find((f) => f.id === composicao[0]?.filamentoId);
  const origemModelo: OrigemModelo3d = {
    fonte: m.fonte,
    link: m.link,
    chave: chaveModelo(m.link),
    autor: m.autor,
    licenca: m.licenca,
    comercial: m.comercial,
    // Não comercial: entra no catálogo, mas só pode ser anunciado depois de confirmar a licença comercial no produto.
    ...(m.comercial === false ? { licencaComercialPropria: e.licencaPropria } : {}),
    medidasMm: m.medidasMm,
    impressoras: cabe.map((i) => i.id),
  };
  await db
    .update(produtos)
    .set({
      composicao,
      filamentoId: composicao[0]?.filamentoId ?? null,
      filamentoG: gramasTotais(composicao),
      tempoImpressaoMin: tempoMin,
      material: principal?.material ?? perfil?.filamentos[0]?.tipo ?? "PLA",
      cor: principal?.cor ?? "",
      custo,
      preco,
      precosCanal: Object.fromEntries(sugeridos.filter((s) => s.canal !== "loja" && s.sugerido > 0).map((s) => [s.canal, s.sugerido])),
      modelo3d: origemModelo,
      atualizadoEm: new Date(),
    })
    .where(eq(produtos.id, criado!.id));
  return criado!;
}

/** Cadastro sem tela: primeiro perfil, cores ligadas aos filamentos mais parecidos, tempo do perfil ou estimado. */
async function cadastrarPeloLink(link: string, origin: string) {
  const m = await emPortugues(await lerModeloDoLink(link));
  const fils = await listaFilamentos();
  const perfil = m.perfis[0] ?? null;
  const cores = perfil?.filamentos.length
    ? perfil.filamentos.map((f) => ({ filamentoId: maisParecido(f, fils), gramas: f.gramas }))
    : [{ filamentoId: maisParecido({ tipo: "PLA", cor: "#222222" }, fils), gramas: m.pesoEstimadoG ?? 0 }];
  const peso = perfil?.pesoG || m.pesoEstimadoG || 0;
  return criarProdutoDoModelo(m, { perfilId: perfil?.id ?? null, cores, tempoMin: perfil?.tempoMin || tempoPeloPeso(peso), licencaPropria: false }, origin);
}

// ------------------------------------------------------------------------------- vários de uma vez (segundo plano)
export type EstadoCadastro = {
  rodando: boolean;
  total: number;
  feitos: number;
  atual: string;
  criados: { id: string; nome: string }[];
  pulados: string[];
  erros: string[];
};
const g = globalThis as unknown as { cadastroModelos?: EstadoCadastro & { fila: { link: string; titulo: string }[] } };
export function estadoCadastro(): EstadoCadastro | null {
  const e = g.cadastroModelos;
  return e ? { rodando: e.rodando, total: e.total, feitos: e.feitos, atual: e.atual, criados: e.criados.slice(-15), pulados: e.pulados.slice(-15), erros: e.erros.slice(-10) } : null;
}

/**
 * Cadastra todos os modelos (só os que a licença deixa vender). Se já tem um trabalho rodando, os novos entram na fila dele.
 * Devolve quantos entraram.
 */
export function cadastrarVarios(modelos: { link: string; titulo: string }[], origin: string) {
  const novos = modelos.filter((x, i) => x.link && modelos.findIndex((y) => chaveModelo(y.link) === chaveModelo(x.link)) === i);
  const atual = g.cadastroModelos;
  if (atual?.rodando) {
    const ja = new Set(atual.fila.map((x) => chaveModelo(x.link)));
    const add = novos.filter((x) => !ja.has(chaveModelo(x.link)));
    atual.fila.push(...add);
    atual.total += add.length;
    return add.length;
  }
  const est: EstadoCadastro & { fila: { link: string; titulo: string }[] } = { rodando: true, total: novos.length, feitos: 0, atual: "", criados: [], pulados: [], erros: [], fila: [...novos] };
  g.cadastroModelos = est;
  void (async () => {
    while (est.fila.length) {
      const x = est.fila.shift()!;
      est.atual = x.titulo;
      try {
        const existe = await produtoDoModelo(x.link);
        if (existe) est.pulados.push(`${x.titulo.slice(0, 50)} (já cadastrado)`);
        else est.criados.push(await cadastrarPeloLink(x.link, origin));
      } catch (e) {
        const msg = (e as Error).message;
        if (/licença/.test(msg)) est.pulados.push(`${x.titulo.slice(0, 50)} (${msg.slice(0, 60)})`);
        else est.erros.push(`${x.titulo.slice(0, 50)}: ${msg.slice(0, 120)}`);
      }
      est.feitos++;
    }
    est.atual = "";
    est.rodando = false;
  })();
  return novos.length;
}
