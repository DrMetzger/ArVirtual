import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { ModeloAchado, OrigemModelo3d } from "@/db/schema";
import { ler3mf, lerZip, malhaStl, medidasMalha, pesoEstimadoPla, type Malha } from "@/lib/assistente/arquivos";
import { gerarComGemini } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import { UPLOAD_DIR } from "@/lib/uploads";

// Modelos 3D de sites de arquivos para impressão: lê título, fotos, licença e (quando o site informa) perfis de impressão
// com tempo, peso e cores; mede a peça pelo arquivo (STL/3MF) para saber em qual impressora cabe.
// Só pelos caminhos oficiais: MakerWorld e Printables são públicos; Thingiverse e Cults pedem a chave da sua conta
// (Configurações › Integrações). Quando um site não deixa, envie o arquivo .3mf/.stl baixado.

export type Fonte = OrigemModelo3d["fonte"];
export type FilamentoModelo = { tipo: string; cor: string; gramas: number };
export type Perfil = {
  id: string;
  titulo: string;
  tempoMin: number;
  pesoG: number;
  filamentos: FilamentoModelo[];
  /** Impressoras Bambu em que o perfil foi testado/compatível (MakerWorld). */
  compativeis: string[];
  placas: number;
};
export type Modelo3d = {
  fonte: Fonte;
  link: string;
  titulo: string;
  autor: string;
  descricao: string;
  fotos: string[];
  licenca: string;
  comercial: boolean | null;
  perfis: Perfil[];
  /** Maior peça do modelo (mm, X × Y × Z), quando deu para medir o arquivo. */
  medidasMm: number[] | null;
  pesoEstimadoG: number | null;
  avisos: string[];
};

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_ARQUIVO = 60 * 1024 * 1024;

const textoDeHtml = (h: string) =>
  h
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** A licença deixa vender as impressões? NC (não comercial) e a licença padrão de arquivo dos sites, não. */
export function licencaComercial(licenca: string): boolean | null {
  const l = licenca.toUpperCase();
  if (!l.trim()) return null;
  if (/\bNC\b|NON-?COMMERCIAL|NÃO COMERCIAL|NAO COMERCIAL|STANDARD DIGITAL FILE|SDFL|PERSONAL USE|USO PESSOAL|PRIVATE USE/.test(l)) return false;
  if (/CC0|PUBLIC DOMAIN|DOM[IÍ]NIO P[UÚ]BLICO|\bBY\b|ATTRIBUTION|GPL|LGPL|\bMIT\b|\bBSD\b|COMMERCIAL USE|USO COMERCIAL|PODE VENDER/.test(l)) return true;
  return null;
}

/** Licença com nome e explicação em português (CC0, CC BY-NC, licença padrão do site...). */
export function licencaPt(texto: string): string {
  const t = texto.toUpperCase();
  if (!t.trim()) return "";
  if (/CC0|PUBLIC DOMAIN|DOM[IÍ]NIO P[UÚ]BLICO/.test(t)) return "CC0 (domínio público: pode vender)";
  if (/STANDARD DIGITAL FILE|SDFL/.test(t)) return "Licença padrão do site (só uso pessoal)";
  if (/\bGPL|LGPL/.test(t)) return "GPL (pode vender)";
  if (/\bMIT\b|\bBSD\b/.test(t)) return "Licença livre (pode vender)";
  if (/\bBY\b|ATTRIBUTION|CREATIVE COMMONS|\bCC\b/.test(t)) {
    const partes = ["BY"];
    if (/\bNC\b|NON-?COMMERCIAL/.test(t)) partes.push("NC");
    if (/\bND\b|NO ?DERIV/.test(t)) partes.push("ND");
    if (/\bSA\b|SHARE ?ALIKE/.test(t)) partes.push("SA");
    const codigo = `CC ${partes.join("-")}`;
    return partes.includes("NC") ? `${codigo} (não comercial)` : partes.includes("ND") ? `${codigo} (pode vender sem modificar, dando crédito)` : `${codigo} (pode vender, dando crédito)`;
  }
  return texto;
}

export function fonteDoLink(link: string): { fonte: Exclude<Fonte, "arquivo">; id: string; perfil?: string } | null {
  const u = link.trim();
  let m = u.match(/makerworld\.com(?:\.cn)?\/(?:[a-z-]+\/)?models\/(\d+)(?:[^#]*#profileId-(\d+))?/i);
  if (m) return { fonte: "makerworld", id: m[1]!, perfil: m[2] };
  m = u.match(/printables\.com\/(?:[a-z-]+\/)?model\/(\d+)/i);
  if (m) return { fonte: "printables", id: m[1]! };
  m = u.match(/thingiverse\.com\/thing:(\d+)/i);
  if (m) return { fonte: "thingiverse", id: m[1]! };
  m = u.match(/cults3d\.com\/[a-z-]+\/[^/]+\/[^/]+\/([a-z0-9-]+)/i) ?? u.match(/cults3d\.com\/[a-z-]+\/[^/]+\/([a-z0-9-]+)/i);
  if (m) return { fonte: "cults", id: m[1]! };
  return null;
}

async function json<T>(url: string, init: RequestInit = {}, origem: string): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": NAVEGADOR, Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res) throw new Error(`${origem} não respondeu. Tente de novo ou envie o arquivo .3mf/.stl.`);
  const t = await res.text();
  if (/just a moment|cf-chl|challenge-platform/i.test(t.slice(0, 3000))) {
    throw new Error(`${origem} bloqueou a leitura automática deste servidor. Baixe o arquivo (.3mf ou .stl) no site e envie aqui.`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`${origem} recusou o acesso (${res.status}): confira a chave em Configurações › Integrações.`);
  if (!res.ok) throw new Error(`${origem} respondeu ${res.status}.`);
  try {
    return JSON.parse(t) as T;
  } catch {
    throw new Error(`${origem} devolveu uma resposta inesperada.`);
  }
}

/** Baixa um arquivo de modelo (STL/3MF) e mede; null se grande demais ou fora do ar. */
async function medirArquivo(url: string, nome: string, init: RequestInit = {}): Promise<Malha | null> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": NAVEGADOR, ...init.headers }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!res?.ok || Number(res.headers.get("content-length") ?? 0) > MAX_ARQUIVO) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ARQUIVO) return null;
  try {
    return /\.3mf$/i.test(nome) ? ler3mf(buf).malha : malhaStl(buf);
  } catch {
    return null;
  }
}

/** Mede até 6 arquivos (cada um é uma peça impressa separada): vale a maior. */
async function medirVarios(arquivos: { url: string; nome: string; tamanho?: number; init?: RequestInit }[]) {
  let maior: number[] | null = null;
  let peso = 0;
  let medidos = 0;
  for (const a of arquivos.filter((x) => /\.(stl|3mf)$/i.test(x.nome) && (x.tamanho ?? 0) <= MAX_ARQUIVO).slice(0, 6)) {
    const m = await medirArquivo(a.url, a.nome, a.init);
    const d = m && medidasMalha(m);
    if (!m || !d) continue;
    medidos++;
    peso += pesoEstimadoPla(m);
    if (!maior || Math.max(...d) > Math.max(...maior)) maior = d;
  }
  return { medidasMm: maior, pesoEstimadoG: medidos ? peso : null, medidos };
}

// ------------------------------------------------------------------------------------------------ MakerWorld
type MWFilamento = { type?: string; color?: string; usedG?: string };
type MWInstancia = {
  id: number;
  title?: string;
  prediction?: number;
  weight?: number;
  instanceFilaments?: MWFilamento[];
  pictures?: { url?: string }[];
  extention?: { modelInfo?: { compatibility?: { devProductName?: string }; otherCompatibility?: { devProductName?: string }[]; plates?: unknown[] } };
};
type MWDesign = {
  id: number;
  title: string;
  summary?: string;
  coverUrl?: string;
  license?: string;
  designCreator?: { name?: string };
  instances?: MWInstancia[];
  designExtension?: { design_pictures?: { url?: string }[]; real_pictures?: { url?: string }[] };
};

const LICENCAS_MW: Record<string, string> = {
  BY: "CC BY (pode vender, dando crédito)",
  "BY-SA": "CC BY-SA (pode vender, dando crédito)",
  "BY-ND": "CC BY-ND (pode vender sem modificar)",
  "BY-NC": "CC BY-NC (não comercial)",
  "BY-NC-SA": "CC BY-NC-SA (não comercial)",
  "BY-NC-ND": "CC BY-NC-ND (não comercial)",
  CC0: "CC0 (domínio público)",
  SDFL: "Standard Digital File License (uso pessoal)",
};

async function makerWorld(id: string, link: string): Promise<Modelo3d> {
  const d = await json<MWDesign>(`https://makerworld.com/api/v1/design-service/design/${id}`, {}, "MakerWorld");
  const perfis: Perfil[] = (d.instances ?? []).map((i) => {
    const mi = i.extention?.modelInfo;
    return {
      id: String(i.id),
      titulo: i.title || `Perfil ${i.id}`,
      tempoMin: Math.round((i.prediction ?? 0) / 60),
      pesoG: Math.round(i.weight ?? 0),
      filamentos: (i.instanceFilaments ?? []).map((f) => ({ tipo: f.type || "PLA", cor: (f.color || "#888888").toUpperCase(), gramas: Number(f.usedG ?? 0) })),
      compativeis: [mi?.compatibility?.devProductName, ...(mi?.otherCompatibility ?? []).map((c) => c.devProductName)].filter((x): x is string => Boolean(x)),
      placas: mi?.plates?.length ?? 1,
    };
  });
  const fotos = [
    ...(d.designExtension?.real_pictures ?? []).map((p) => p.url),
    ...(d.designExtension?.design_pictures ?? []).map((p) => p.url),
    d.coverUrl,
  ].filter((x): x is string => Boolean(x));
  const lic = d.license ?? "";
  return {
    fonte: "makerworld",
    link,
    titulo: d.title,
    autor: d.designCreator?.name ?? "",
    descricao: textoDeHtml(d.summary ?? ""),
    fotos: [...new Set(fotos)].slice(0, 10),
    licenca: licencaPt(LICENCAS_MW[lic] ?? lic),
    comercial: licencaComercial(LICENCAS_MW[lic] ?? lic),
    perfis,
    medidasMm: null,
    pesoEstimadoG: null,
    avisos: perfis.length ? [] : ["O modelo não tem perfil de impressão publicado: informe o filamento e o tempo depois de fatiar."],
  };
}

// ------------------------------------------------------------------------------------------------ Printables
type PrintablesPrint = {
  id: string;
  name: string;
  description?: string;
  summary?: string;
  license?: { name?: string; abbreviation?: string };
  user?: { publicUsername?: string };
  images?: { filePath: string }[];
  stls?: { id: string; name: string; fileSize?: number }[];
};

async function printables(id: string, link: string): Promise<Modelo3d> {
  const gql = <T>(query: string) =>
    json<{ data?: T; errors?: { message: string }[] }>("https://api.printables.com/graphql/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) }, "Printables");
  const r = await gql<{ print: PrintablesPrint | null }>(
    `query { print(id: "${id}") { id name description summary license { name abbreviation } user { publicUsername } images { filePath } stls { id name fileSize } } }`,
  );
  const p = r.data?.print;
  if (!p) throw new Error(r.errors?.[0]?.message ? `Printables: ${r.errors[0].message}` : "Modelo não encontrado no Printables.");
  const arquivos: { url: string; nome: string; tamanho?: number }[] = [];
  for (const s of (p.stls ?? []).slice(0, 6)) {
    const l = await gql<{ getDownloadLink: { ok: boolean; output?: { link: string } } }>(
      `mutation { getDownloadLink(id: "${s.id}", printId: "${p.id}", fileType: stl, source: model_detail) { ok output { link } } }`,
    ).catch(() => null);
    const url = l?.data?.getDownloadLink?.output?.link;
    if (url) arquivos.push({ url, nome: s.name, tamanho: s.fileSize });
  }
  const med = await medirVarios(arquivos);
  const lic = licencaPt([p.license?.abbreviation, p.license?.name].filter(Boolean).join(" "));
  return {
    fonte: "printables",
    link,
    titulo: p.name,
    autor: p.user?.publicUsername ?? "",
    descricao: textoDeHtml(p.description || p.summary || ""),
    fotos: (p.images ?? []).map((i) => `https://media.printables.com/${i.filePath}`).slice(0, 10),
    licenca: lic,
    comercial: licencaComercial(lic),
    perfis: [],
    medidasMm: med.medidasMm,
    pesoEstimadoG: med.pesoEstimadoG,
    avisos: [
      ...(med.medidos ? [] : ["Não deu para medir os arquivos (grandes demais ou sem STL): confira o tamanho no fatiador."]),
      "O Printables não informa tempo nem cores: o peso é uma estimativa pelo volume (2 paredes, 15%). Para o número exato, envie o 3MF fatiado.",
    ],
  };
}

// ------------------------------------------------------------------------------------------------ Thingiverse
type ThingTV = { id: number; name: string; description?: string; description_html?: string; license?: string; creator?: { name?: string } };

async function thingiverse(id: string, link: string): Promise<Modelo3d> {
  const token = (await getSettings(["thingiverse.token"]))["thingiverse.token"].trim();
  if (!token) throw new Error("Para ler do Thingiverse, cadastre o App Token em Configurações › Integrações › Thingiverse (ou envie o arquivo baixado).");
  const api = (p: string) => `https://api.thingiverse.com${p}`;
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const t = await json<ThingTV>(api(`/things/${id}`), auth, "Thingiverse");
  const imgs = await json<{ sizes?: { type: string; size: string; url: string }[] }[]>(api(`/things/${id}/images`), auth, "Thingiverse").catch(() => []);
  const arqs = await json<{ name: string; size?: number; download_url?: string }[]>(api(`/things/${id}/files`), auth, "Thingiverse").catch(() => []);
  const med = await medirVarios(arqs.filter((a) => a.download_url).map((a) => ({ url: a.download_url!, nome: a.name, tamanho: a.size, init: auth })));
  const fotos = imgs
    .map((i) => i.sizes?.find((s) => s.type === "display" && s.size === "large")?.url ?? i.sizes?.find((s) => s.size === "large")?.url)
    .filter((x): x is string => Boolean(x));
  return {
    fonte: "thingiverse",
    link,
    titulo: t.name,
    autor: t.creator?.name ?? "",
    descricao: textoDeHtml(t.description_html || t.description || ""),
    fotos: fotos.slice(0, 10),
    licenca: licencaPt(t.license ?? ""),
    comercial: licencaComercial(t.license ?? ""),
    perfis: [],
    medidasMm: med.medidasMm,
    pesoEstimadoG: med.pesoEstimadoG,
    avisos: [
      ...(med.medidos ? [] : ["Não deu para medir os arquivos: confira o tamanho no fatiador."]),
      "O Thingiverse não informa tempo nem cores: o peso é estimado pelo volume. Para o número exato, envie o 3MF fatiado.",
    ],
  };
}

// ------------------------------------------------------------------------------------------------ Cults
type CultsCriacao = { name: string; description?: string; url?: string; illustrations?: { imageUrl: string }[]; license?: { name?: string; code?: string }; creator?: { nick?: string } };

async function cults(slug: string, link: string): Promise<Modelo3d> {
  const s = await getSettings(["cults.usuario", "cults.chave"]);
  if (!s["cults.usuario"] || !s["cults.chave"]) throw new Error("Para ler do Cults, cadastre usuário e chave da API em Configurações › Integrações › Cults (ou envie o arquivo baixado).");
  const auth = Buffer.from(`${s["cults.usuario"].trim()}:${s["cults.chave"].trim()}`).toString("base64");
  const r = await json<{ data?: { creation: CultsCriacao | null }; errors?: { message: string }[] }>(
    "https://cults3d.com/graphql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        query: `query($slug: String!) { creation(slug: $slug) { name(locale: PT) description(locale: PT) url(locale: PT) illustrations { imageUrl } license { name(locale: PT) code } creator { nick } } }`,
        variables: { slug },
      }),
    },
    "Cults",
  );
  const c = r.data?.creation;
  if (!c) throw new Error(r.errors?.[0]?.message ? `Cults: ${r.errors[0].message}` : "Modelo não encontrado no Cults.");
  const lic = licencaPt([c.license?.code, c.license?.name].filter(Boolean).join(" "));
  return {
    fonte: "cults",
    link,
    titulo: c.name,
    autor: c.creator?.nick ?? "",
    descricao: textoDeHtml(c.description ?? ""),
    fotos: (c.illustrations ?? []).map((i) => i.imageUrl).slice(0, 10),
    licenca: lic,
    comercial: licencaComercial(lic),
    perfis: [],
    medidasMm: null,
    pesoEstimadoG: null,
    avisos: ["O Cults não entrega o arquivo pela API: envie o .3mf/.stl baixado para medir e calcular o peso exato."],
  };
}

export async function lerModeloDoLink(link: string): Promise<Modelo3d> {
  const f = fonteDoLink(link);
  if (!f) throw new Error("Link não reconhecido. Use um link de modelo do MakerWorld, Printables, Thingiverse ou Cults.");
  const limpo = link.trim();
  const m =
    f.fonte === "makerworld" ? await makerWorld(f.id, limpo) : f.fonte === "printables" ? await printables(f.id, limpo) : f.fonte === "thingiverse" ? await thingiverse(f.id, limpo) : await cults(f.id, limpo);
  // Perfil indicado no link (#profileId-…) vem primeiro.
  if (f.perfil) m.perfis.sort((a, b) => (a.id === f.perfil ? -1 : b.id === f.perfil ? 1 : 0));
  return m;
}

/** Arquivo enviado (.3mf do Bambu Studio/Orca ou .stl): medidas, e no 3MF fatiado o tempo, o peso e as cores exatos. */
export async function lerModeloDoArquivo(nome: string, buf: Buffer, origin: string, link = ""): Promise<Modelo3d> {
  const ehStl = /\.stl$/i.test(nome);
  if (!ehStl && !/\.3mf$/i.test(nome)) throw new Error("Envie um arquivo .3mf (Bambu Studio / OrcaSlicer) ou .stl.");
  if (buf.length > MAX_ARQUIVO) throw new Error("Arquivo maior que 60 MB.");
  const base = { fonte: (fonteDoLink(link)?.fonte ?? "arquivo") as Fonte, link, titulo: nome.replace(/\.(3mf|stl)$/i, "").replace(/[_-]+/g, " ").trim(), autor: "", descricao: "", licenca: "", comercial: null };
  if (ehStl) {
    const m = malhaStl(buf);
    return { ...base, fotos: [], perfis: [], medidasMm: medidasMalha(m), pesoEstimadoG: m.triangulos ? pesoEstimadoPla(m) : null, avisos: ["STL não tem fotos, tempo nem cores: o peso é estimado pelo volume."] };
  }
  const r = ler3mf(buf);
  // Miniatura das mesas do Bambu Studio vira a primeira foto.
  const fotos: string[] = [];
  try {
    const miniaturas = lerZip(buf, (n) => /^Metadata\/plate_\d+\.png$/i.test(n));
    for (const [, png] of [...miniaturas].slice(0, 4)) {
      const jpg = await sharp(png).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
      await mkdir(UPLOAD_DIR, { recursive: true });
      const arq = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.jpg`;
      await writeFile(`${UPLOAD_DIR}/${arq}`, jpg);
      fotos.push(`${process.env.APP_URL ?? origin}/uploads/${arq}`);
    }
  } catch {
    /* sem miniatura */
  }
  const perfis: Perfil[] = r.fatiamento
    ? [{ id: "arquivo", titulo: "Fatiamento do arquivo", tempoMin: Math.round(r.fatiamento.tempoS / 60), pesoG: r.fatiamento.pesoG, filamentos: r.fatiamento.filamentos, compativeis: [], placas: 1 }]
    : r.cores.length
      ? [{ id: "arquivo", titulo: "Cores do projeto (sem fatiar)", tempoMin: 0, pesoG: 0, filamentos: r.cores.map((c) => ({ ...c, gramas: 0 })), compativeis: [], placas: 1 }]
      : [];
  return {
    ...base,
    fotos,
    perfis,
    medidasMm: medidasMalha(r.malha),
    pesoEstimadoG: r.malha.triangulos ? pesoEstimadoPla(r.malha) : null,
    avisos: r.fatiamento ? [] : ["O 3MF não está fatiado: no Bambu Studio use Fatiar e depois Arquivo › Exportar › Arquivo fatiado (.gcode.3mf) para trazer tempo e gramas exatos."],
  };
}

// ------------------------------------------------------------------------------------------------ Busca
/** Procura modelos no MakerWorld e no Printables (20 em cada); os que a licença deixa vender vêm primeiro, depois os mais baixados. */
async function buscarTermo(q: string): Promise<ModeloAchado[]> {
  const mw = json<{ hits?: { id: number; title: string; slug?: string; cover?: string; license?: string; downloadCount?: number; likeCount?: number; designCreator?: { name?: string } }[] }>(
    `https://makerworld.com/api/v1/search-service/select/design2?keyword=${encodeURIComponent(q)}&limit=20&offset=0`,
    {},
    "MakerWorld",
  )
    .then((r) =>
      (r.hits ?? []).map((h): ModeloAchado => {
        const lic = licencaPt(LICENCAS_MW[h.license ?? ""] ?? h.license ?? "");
        return {
          fonte: "makerworld",
          titulo: h.title,
          link: `https://makerworld.com/pt/models/${h.id}${h.slug ? `-${h.slug}` : ""}`,
          imagem: h.cover ?? "",
          autor: h.designCreator?.name ?? "",
          licenca: lic,
          comercial: licencaComercial(lic),
          downloads: h.downloadCount ?? 0,
          curtidas: h.likeCount ?? 0,
        };
      }),
    )
    .catch(() => [] as ModeloAchado[]);
  const pr = json<{ data?: { searchPrints2?: { items?: { id: string; name: string; slug: string; license?: { abbreviation?: string; name?: string }; image?: { filePath?: string }; likesCount?: number; downloadCount?: number; user?: { publicUsername?: string } }[] } } }>(
    "https://api.printables.com/graphql/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($q: String!, $n: Int) { searchPrints2(query: $q, limit: $n) { items { id name slug license { abbreviation name } image { filePath } likesCount downloadCount user { publicUsername } } } }`,
        variables: { q, n: 20 },
      }),
    },
    "Printables",
  )
    .then((r) =>
      (r.data?.searchPrints2?.items ?? []).map((i): ModeloAchado => {
        const lic = licencaPt([i.license?.abbreviation, i.license?.name].filter(Boolean).join(" "));
        return {
          fonte: "printables",
          titulo: i.name,
          link: `https://www.printables.com/model/${i.id}-${i.slug}`,
          imagem: i.image?.filePath ? `https://media.printables.com/${i.image.filePath}` : "",
          autor: i.user?.publicUsername ?? "",
          licenca: lic,
          comercial: licencaComercial(lic),
          downloads: i.downloadCount ?? 0,
          curtidas: i.likesCount ?? 0,
        };
      }),
    )
    .catch(() => [] as ModeloAchado[]);
  return [...(await mw), ...(await pr)];
}

// ------------------------------------------------------------------------------------------------ Português
// Os sites são em inglês e o MakerWorld chega a bloquear pesquisas em português vindas do servidor:
// a pesquisa vai traduzida para o inglês por dentro e os títulos voltam traduzidos para o português.
const traducoes = new Map<string, string>();

/** Traduz textos curtos (títulos, termos) de/para o português com a IA; o que falhar fica como estava. */
async function traduzir(textos: string[], para: "pt" | "en"): Promise<string[]> {
  const chave = (t: string) => `${para}|${t}`;
  const faltam = [...new Set(textos.filter((t) => t.trim() && !traducoes.has(chave(t))))];
  for (let i = 0; i < faltam.length; i += 40) {
    const lote = faltam.slice(i, i + 40);
    try {
      const resp = await gerarComGemini(
        [
          {
            role: "user",
            text:
              (para === "en"
                ? "Traduza para o inglês estes termos de busca de modelos para impressão 3D (palavras que um maker usaria no MakerWorld/Printables)."
                : "Traduza para o português do Brasil estes títulos de modelos para impressão 3D, curtos e naturais (mantenha nomes próprios, marcas e números).") +
              `\nResponda só JSON: um array de strings na mesma ordem.\n${JSON.stringify(lote)}`,
          },
        ],
        { json: true, temperature: 0 },
      );
      const arr = JSON.parse(resp.slice(resp.indexOf("["), resp.lastIndexOf("]") + 1)) as unknown[];
      lote.forEach((t, k) => {
        const v = typeof arr[k] === "string" ? (arr[k] as string).trim() : "";
        if (v) traducoes.set(chave(t), v.slice(0, 200));
      });
    } catch {
      /* sem IA: fica no original */
    }
  }
  if (traducoes.size > 5000) traducoes.clear();
  return textos.map((t) => traducoes.get(chave(t)) ?? t);
}

/** Procura modelos (você digita em português); os que a licença deixa vender vêm primeiro, depois os mais baixados. */
export async function buscarModelos(termo: string, limite = 6): Promise<ModeloAchado[]> {
  const q = termo.trim().slice(0, 80);
  if (!q) return [];
  const [ingles] = await traduzir([q], "en");
  const termos = [...new Set([ingles!, q].map((t) => t.toLowerCase()))];
  const vistos = new Set<string>();
  const todos: ModeloAchado[] = [];
  for (const t of termos) {
    let achados = await buscarTermo(t);
    // O MakerWorld às vezes recusa a primeira pesquisa: tenta mais uma vez.
    if (!achados.some((m) => m.fonte === "makerworld")) {
      await new Promise((r) => setTimeout(r, 1200));
      achados = [...achados.filter((m) => m.fonte !== "makerworld"), ...(await buscarTermo(t)).filter((m) => m.fonte === "makerworld")];
    }
    for (const m of achados) if (!vistos.has(m.link)) vistos.add(m.link) && todos.push(m);
  }
  const peso = (m: ModeloAchado) => (m.comercial === true ? 2 : m.comercial === null ? 1 : 0);
  const melhores = todos.sort((a, b) => peso(b) - peso(a) || b.downloads - a.downloads).slice(0, limite);
  const titulos = await traduzir(melhores.map((m) => m.titulo), "pt");
  return melhores.map((m, i) => ({ ...m, titulo: titulos[i] ?? m.titulo }));
}

/** Título e nomes dos perfis do modelo lido em português (a descrição a IA já reescreve ao cadastrar). */
export async function emPortugues(m: Modelo3d): Promise<Modelo3d> {
  const [titulo, ...perfis] = await traduzir([m.titulo, ...m.perfis.map((p) => p.titulo)], "pt");
  return { ...m, titulo: titulo ?? m.titulo, perfis: m.perfis.map((p, i) => ({ ...p, titulo: perfis[i] ?? p.titulo })) };
}
