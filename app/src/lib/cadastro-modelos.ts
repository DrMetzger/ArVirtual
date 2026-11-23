import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { arquivosProduto, NOMES_FONTE, produtos, type OrigemModelo3d } from "@/db/schema";
import { maisParecido, tempoPeloPeso } from "@/lib/cores-filamento";
import { listaFilamentos } from "@/lib/filamentos";
import { custoComposicao, gramasTotais } from "@/lib/impressao";
import { encaixe, listaImpressoras } from "@/lib/impressoras";
import { importarProduto } from "@/lib/importar-produto";
import { emPortugues, fonteDoLink, lerModeloDoLink, linkDownloadSketchfab, type Modelo3d } from "@/lib/modelos3d";
import { lerZip } from "@/lib/assistente/arquivos";
import { precosPorCanal } from "@/lib/precificacao";
import { linkDownloadMakerWorld } from "@/lib/bambu-conta";
import { precoDeMercado } from "@/lib/preco-mercado";
import { getParametrosImpressao, getParametrosPreco, getSettings } from "@/lib/settings";
import { EXTENSOES_IMPRESSAO, MAX_ARQUIVO_IMPRESSAO, PASTA_IMPRESSAO } from "@/lib/uploads";

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
  // Preço pelo mercado (o que os concorrentes cobram); sem pesquisa, o sugerido com os mínimos.
  const pm = custo > 0 ? await precoDeMercado(m.titulo, custo, pp).catch((e: Error) => (console.warn(`[modelos3d] mercado: ${e.message}`), null)) : null;
  const precoCanal = (c: "mercadolivre" | "shopee" | "magalu" | "loja") => pm?.precos[c] ?? sugeridos.find((s) => s.canal === c)?.sugerido ?? 0;
  const preco = precoCanal("loja");
  // Medidas da caixa: a peça + 2 cm de folga (mínimo 5 cm); sem as medidas da peça ficam vazias e o anúncio fica
  // bloqueado até você preencher no produto.
  const medidasCm = m.medidasMm ? m.medidasMm.map((v) => Math.max(5, Math.ceil(v / 10) + 2)) : null;
  const it = importarProduto(m.link || m.titulo, process.env.APP_URL ?? origin, {
    titulo: m.titulo,
    descricao: m.descricao,
    fotos: m.fotos,
    videos: [],
    preco,
    // Peso com embalagem: a peça + ~40 g de caixa e proteção.
    pesoG: (() => {
      const peca = Math.round(gramasTotais(composicao) || perfil?.pesoG || m.pesoEstimadoG || 0);
      return peca ? peca + 40 : 0;
    })(),
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
    ...(pm
      ? {
          mercado: Object.fromEntries(
            Object.entries(pm.mercado).map(([c, x]) => [c, { mediana: x!.mediana, anuncios: x!.anuncios, concorrer: x!.concorrer }]),
          ),
        }
      : {}),
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
      precosCanal: Object.fromEntries((["mercadolivre", "shopee", "magalu"] as const).map((c) => [c, precoCanal(c)]).filter(([, v]) => Number(v) > 0)),
      modelo3d: origemModelo,
      atualizadoEm: new Date(),
    })
    .where(eq(produtos.id, criado!.id));
  await anexarArquivos(criado!.id, m, e.perfilId).catch((err: Error) => console.warn(`[modelos3d] arquivos: ${err.message}`));
  return criado!;
}

/** Arquivos de impressão do modelo (o enviado na tela ou os que o site deixa baixar) vão para o produto. */
export async function anexarArquivos(produtoId: string, m: Modelo3d, perfilId?: string | null): Promise<number> {
  let anexados = 0;
  await mkdir(PASTA_IMPRESSAO, { recursive: true });
  const gravar = async (nome: string, origem: { caminho?: string; dados?: Buffer }) => {
    const ext = (nome.split(".").pop() ?? "").toLowerCase();
    if (!EXTENSOES_IMPRESSAO.includes(ext)) return;
    const arquivo = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
    if (origem.caminho) await rename(origem.caminho, `${PASTA_IMPRESSAO}/${arquivo}`);
    else await writeFile(`${PASTA_IMPRESSAO}/${arquivo}`, origem.dados!);
    const tamanho = (await stat(`${PASTA_IMPRESSAO}/${arquivo}`)).size;
    await db.insert(arquivosProduto).values({ produtoId, nome: nome.slice(0, 200), arquivo, tamanho, enviadoPor: `Importado (${NOMES_FONTE[m.fonte]})` });
    anexados++;
  };
  if (m.arquivoLocal) await gravar(m.arquivoLocal.nome, { caminho: m.arquivoLocal.caminho });
  const token = m.fonte === "thingiverse" ? (await getSettings(["thingiverse.token"]))["thingiverse.token"].trim() : "";
  // MakerWorld: só o 3MF do perfil escolhido (ou o primeiro), pelo link que a conta Bambu libera.
  const lista = m.fonte === "makerworld" ? (m.arquivos ?? []).filter((a, i) => (perfilId ? a.url === `makerworld:${perfilId}` : i === 0)).slice(0, 1) : (m.arquivos ?? []);
  for (const original of lista.slice(0, 10)) {
    let a = original;
    if (a.url.startsWith("makerworld:")) {
      const l = await linkDownloadMakerWorld(a.url.slice("makerworld:".length));
      if (!l) continue;
      a = { nome: /\.3mf$/i.test(l.nome) ? l.nome : a.nome, url: l.url };
    }
    if (a.url.startsWith("sketchfab:")) {
      const url = await linkDownloadSketchfab(a.url.slice("sketchfab:".length));
      if (!url) continue;
      a = { ...a, url };
    }
    if ((a.tamanho ?? 0) > MAX_ARQUIVO_IMPRESSAO) continue;
    const res = await fetch(a.url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(180_000) }).catch(() => null);
    if (!res?.ok || Number(res.headers.get("content-length") ?? 0) > MAX_ARQUIVO_IMPRESSAO) continue;
    const dados = Buffer.from(await res.arrayBuffer());
    if (!dados.length || dados.length > MAX_ARQUIVO_IMPRESSAO) continue;
    // Pacote .zip (Sketchfab, Thingiverse): guarda os arquivos de impressão de dentro; sem nenhum, o próprio .zip.
    if (/\.zip$/i.test(a.nome) || dados.subarray(0, 2).toString() === "PK") {
      const dentro = (() => {
        try {
          return lerZip(dados, (n) => /\.(stl|3mf|obj|step|stp|amf|ply)$/i.test(n) && !n.startsWith("__MACOSX"));
        } catch {
          return new Map<string, Buffer>();
        }
      })();
      if (dentro.size) {
        for (const [n, b] of [...dentro].slice(0, 20)) if (b.length <= MAX_ARQUIVO_IMPRESSAO) await gravar(n.split("/").pop() || n, { dados: b });
        continue;
      }
    }
    await gravar(a.nome, { dados });
  }
  return anexados;
}

/** Produto já cadastrado de um modelo 3D: baixa agora os arquivos do site (ex.: depois de conectar a conta Bambu). */
export async function baixarArquivosDoModelo(produtoId: string) {
  const [p] = await db.select({ modelo3d: produtos.modelo3d }).from(produtos).where(eq(produtos.id, produtoId));
  if (!p?.modelo3d?.link) throw new Error("Este produto não veio de um site de modelos 3D.");
  const m = await lerModeloDoLink(p.modelo3d.link);
  const n = await anexarArquivos(produtoId, m, null);
  if (!n) {
    throw new Error(
      m.fonte === "makerworld"
        ? "O MakerWorld não liberou o download: conecte (ou reconecte) sua conta Bambu Lab em Configurações › Integrações."
        : `O ${NOMES_FONTE[m.fonte]} não libera o download sem login: baixe no site e arraste aqui.`,
    );
  }
  return n;
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
