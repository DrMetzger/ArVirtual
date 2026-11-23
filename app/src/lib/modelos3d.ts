import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { FONTES_MODELO, type FonteModelo, type ModeloAchado, type OrigemModelo3d } from "@/db/schema";
import { ler3mf, lerZip, malhaStl, medidasMalha, pesoEstimadoPla, type Malha } from "@/lib/assistente/arquivos";
import { gerarComGemini } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import { PASTA_IMPRESSAO, UPLOAD_DIR } from "@/lib/uploads";

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
  /** Arquivos de impressão que o site deixa baixar (vão para "Arquivos de impressão" do produto). */
  arquivos?: { nome: string; url: string; tamanho?: number }[];
  /** Arquivo enviado na tela (guardado até cadastrar). */
  arquivoLocal?: { nome: string; caminho: string };
};

const AVISO_LOGIN = (site: string) =>
  `O ${site} só libera o download do arquivo com login: baixe no site e arraste em "Arquivos de impressão" do produto depois de cadastrar.`;

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
  m = u.match(/sketchfab\.com\/(?:3d-models|models)\/(?:[^/?#]*-)?([0-9a-f]{32})/i);
  if (m) return { fonte: "sketchfab", id: m[1]! };
  m = u.match(/myminifactory\.com\/object\/(?:[a-z0-9-]*-)?(\d+)/i);
  if (m) return { fonte: "myminifactory", id: m[1]! };
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
    // O 3MF de cada perfil baixa com a sua conta Bambu Lab (Configurações › Integrações).
    arquivos: perfis.map((p) => ({ nome: `${d.title} - ${p.titulo}.3mf`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 180), url: `makerworld:${p.id}` })),
    avisos: [
      ...((await getSettings(["makerworld.token"]))["makerworld.token"] ? [] : ["Para o 3MF vir junto, conecte sua conta Bambu Lab em Configurações › Integrações (o MakerWorld só libera o download com login)."]),
      ...(perfis.length ? [] : ["O modelo não tem perfil de impressão publicado: informe o filamento e o tempo depois de fatiar."]),
    ],
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
  for (const s of (p.stls ?? []).slice(0, 10)) {
    const l = await gql<{ getDownloadLink: { ok: boolean; output?: { link: string } } }>(
      `mutation { getDownloadLink(id: "${s.id}", printId: "${p.id}", fileType: stl, source: model_detail) { ok output { link } } }`,
    ).catch(() => null);
    const url = l?.data?.getDownloadLink?.output?.link;
    if (url) arquivos.push({ url, nome: s.name, tamanho: s.fileSize });
  }
  const med = await medirVarios(arquivos.slice(0, 6));
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
    arquivos,
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
    arquivos: arqs.filter((a) => a.download_url).map((a) => ({ nome: a.name, url: a.download_url!, tamanho: a.size })).slice(0, 10),
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
    avisos: [AVISO_LOGIN("Cults3D"), "Envie o .3mf/.stl baixado para medir e calcular o peso exato."],
  };
}

// ------------------------------------------------------------------------------------------------ Sketchfab
// API pública oficial (api.sketchfab.com/v3): busca, fotos e licença sem chave; o arquivo original pede o token grátis
// da conta (sketchfab.com › Settings › Password & API).
type SketchfabModelo = {
  uid: string;
  name: string;
  description?: string;
  viewerUrl?: string;
  isDownloadable?: boolean;
  license?: { label?: string; fullName?: string; requirements?: string; slug?: string } | null;
  user?: { username?: string; displayName?: string };
  thumbnails?: { images?: { url: string; width: number }[] };
  likeCount?: number;
  viewCount?: number;
};

const fotosSketchfab = (t: SketchfabModelo["thumbnails"]) =>
  [...(t?.images ?? [])].sort((a, b) => b.width - a.width).filter((i) => i.width >= 400).map((i) => i.url);

const licencaSketchfab = (l: SketchfabModelo["license"]) => {
  const texto = [l?.fullName || l?.label, l?.slug === "st" || l?.slug === "ed" ? "Standard" : "", l?.requirements].filter(Boolean).join(" ");
  // "Commercial use is allowed" / "not allowed" vem escrito na licença.
  const comercial = /commercial use is not allowed|non-?commercial/i.test(texto) ? false : /commercial use is allowed/i.test(texto) ? true : licencaComercial(texto);
  return { licenca: licencaPt(l?.fullName || l?.label || ""), comercial };
};

async function sketchfab(id: string, link: string): Promise<Modelo3d> {
  const m = await json<SketchfabModelo>(`https://api.sketchfab.com/v3/models/${id}`, {}, "Sketchfab");
  const { licenca, comercial } = licencaSketchfab(m.license);
  const token = (await getSettings(["sketchfab.token"]))["sketchfab.token"].trim();
  return {
    fonte: "sketchfab",
    link: m.viewerUrl || link,
    titulo: m.name,
    autor: m.user?.username || m.user?.displayName || "",
    descricao: textoDeHtml(m.description ?? ""),
    fotos: fotosSketchfab(m.thumbnails).slice(0, 1),
    licenca,
    comercial,
    perfis: [],
    medidasMm: null,
    pesoEstimadoG: null,
    avisos: [
      m.isDownloadable === false
        ? "O autor não liberou o download deste modelo no Sketchfab."
        : token
          ? "O ERP baixa o arquivo original do Sketchfab para o produto."
          : "Para o ERP baixar o arquivo do Sketchfab, cadastre o token grátis em Configurações › Integrações › Sketchfab.",
      "O Sketchfab não informa peso nem tempo: envie o arquivo (ou o 3MF fatiado) para o custo exato.",
    ],
    arquivos: m.isDownloadable === false ? [] : [{ nome: `${m.name} (Sketchfab).zip`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 180), url: `sketchfab:${m.uid}` }],
  };
}

/** Link temporário do arquivo original do Sketchfab (precisa do token da conta). */
export async function linkDownloadSketchfab(uid: string): Promise<string | null> {
  const token = (await getSettings(["sketchfab.token"]))["sketchfab.token"].trim();
  if (!token) return null;
  const r = await json<{ source?: { url?: string }; glb?: { url?: string } }>(
    `https://api.sketchfab.com/v3/models/${uid}/download`,
    { headers: { Authorization: `Token ${token}` } },
    "Sketchfab",
  ).catch(() => null);
  return r?.source?.url ?? null;
}

// ------------------------------------------------------------------------------------------------ MyMiniFactory
async function myMiniFactory(id: string, link: string): Promise<Modelo3d> {
  const chave = (await getSettings(["myminifactory.chave"]))["myminifactory.chave"].trim();
  if (!chave) throw new Error("Para ler do MyMiniFactory, cadastre a chave em Configurações › Integrações › MyMiniFactory (ou envie o arquivo baixado).");
  const o = await json<{ name: string; description?: string; url?: string; images?: { standard?: { url?: string } }[]; designer?: { username?: string }; license?: string; licenses?: { type?: string; value?: boolean }[] }>(
    `https://www.myminifactory.com/api/v2/objects/${id}?key=${encodeURIComponent(chave)}`,
    {},
    "MyMiniFactory",
  );
  const comercialMMF = o.licenses?.find((l) => /commercial/i.test(l.type ?? ""))?.value;
  return {
    fonte: "myminifactory",
    link,
    titulo: o.name,
    autor: o.designer?.username ?? "",
    descricao: textoDeHtml(o.description ?? ""),
    fotos: (o.images ?? []).map((i) => i.standard?.url).filter((x): x is string => Boolean(x)).slice(0, 10),
    licenca: comercialMMF === true ? "Uso comercial permitido" : comercialMMF === false ? "Sem uso comercial" : licencaPt(o.license ?? ""),
    comercial: comercialMMF ?? licencaComercial(o.license ?? ""),
    perfis: [],
    medidasMm: null,
    pesoEstimadoG: null,
    avisos: [AVISO_LOGIN("MyMiniFactory"), "O MyMiniFactory não informa peso nem tempo pela API: envie o arquivo para o custo exato."],
  };
}

export async function lerModeloDoLink(link: string): Promise<Modelo3d> {
  const f = fonteDoLink(link);
  if (!f) throw new Error("Link não reconhecido. Use um link de modelo do MakerWorld, Printables, Sketchfab, Thingiverse, Cults3D ou MyMiniFactory.");
  const limpo = link.trim();
  const leitores: Record<FonteModelo, (id: string, l: string) => Promise<Modelo3d>> = {
    makerworld: makerWorld,
    printables,
    sketchfab,
    thingiverse,
    cults,
    myminifactory: myMiniFactory,
  };
  const m = await leitores[f.fonte](f.id, limpo);
  // Perfil indicado no link (#profileId-…) vem primeiro.
  if (f.perfil) m.perfis.sort((a, b) => (a.id === f.perfil ? -1 : b.id === f.perfil ? 1 : 0));
  return m;
}

/** Arquivo enviado (.3mf do Bambu Studio/Orca ou .stl): medidas, e no 3MF fatiado o tempo, o peso e as cores exatos. */
export async function lerModeloDoArquivo(nome: string, buf: Buffer, origin: string, link = ""): Promise<Modelo3d> {
  const ehStl = /\.stl$/i.test(nome);
  if (!ehStl && !/\.3mf$/i.test(nome)) throw new Error("Envie um arquivo .3mf (Bambu Studio / OrcaSlicer) ou .stl.");
  if (buf.length > MAX_ARQUIVO) throw new Error("Arquivo maior que 60 MB.");
  // O próprio arquivo fica guardado e vai para os arquivos de impressão do produto ao cadastrar.
  await mkdir(PASTA_IMPRESSAO, { recursive: true });
  const caminho = `${PASTA_IMPRESSAO}/tmp-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ehStl ? "stl" : "3mf"}`;
  await writeFile(caminho, buf);
  const base = {
    fonte: (fonteDoLink(link)?.fonte ?? "arquivo") as Fonte,
    link,
    titulo: nome.replace(/\.(gcode\.)?(3mf|stl)$/i, "").replace(/[_-]+/g, " ").trim(),
    autor: "",
    descricao: "",
    licenca: "",
    comercial: null,
    arquivoLocal: { nome: nome.slice(0, 200), caminho },
  };
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
// Cada site devolve os modelos e como foi ("12 modelos", "precisa da chave", "fora do ar").
type ResultadoFonte = { modelos: ModeloAchado[]; status: string };
const POR_FONTE = 20;

const statusDe = (n: number) => (n ? `${n} modelo(s)` : "nada encontrado");
const erroDe = (e: unknown) => {
  const m = (e as Error).message ?? "";
  return /bloqueou/.test(m) ? "bloqueou a pesquisa" : /recusou|401|403/.test(m) ? "recusou a chave" : "fora do ar agora";
};

async function buscaMakerWorld(q: string): Promise<ResultadoFonte> {
  type R = { hits?: { id: number; title: string; slug?: string; cover?: string; license?: string; downloadCount?: number; likeCount?: number; designCreator?: { name?: string } }[] };
  const url = `https://makerworld.com/api/v1/search-service/select/design2?keyword=${encodeURIComponent(q)}&limit=${POR_FONTE}&offset=0`;
  // O MakerWorld às vezes recusa a primeira pesquisa: tenta mais uma vez.
  const r = await json<R>(url, {}, "MakerWorld").catch(async () => {
    await new Promise((ok) => setTimeout(ok, 1500));
    return json<R>(url, {}, "MakerWorld");
  });
  const modelos = (r.hits ?? []).map((h): ModeloAchado => {
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
  });
  return { modelos, status: statusDe(modelos.length) };
}

async function buscaPrintables(q: string): Promise<ResultadoFonte> {
  const r = await json<{ data?: { searchPrints2?: { items?: { id: string; name: string; slug: string; license?: { abbreviation?: string; name?: string }; image?: { filePath?: string }; likesCount?: number; downloadCount?: number; user?: { publicUsername?: string } }[] } } }>(
    "https://api.printables.com/graphql/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($q: String!, $n: Int) { searchPrints2(query: $q, limit: $n) { items { id name slug license { abbreviation name } image { filePath } likesCount downloadCount user { publicUsername } } } }`,
        variables: { q, n: POR_FONTE },
      }),
    },
    "Printables",
  );
  const modelos = (r.data?.searchPrints2?.items ?? []).map((i): ModeloAchado => {
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
  });
  return { modelos, status: statusDe(modelos.length) };
}

async function buscaSketchfab(q: string): Promise<ResultadoFonte> {
  const r = await json<{ results?: SketchfabModelo[] }>(
    `https://api.sketchfab.com/v3/search?type=models&downloadable=true&q=${encodeURIComponent(q)}&count=${POR_FONTE}`,
    {},
    "Sketchfab",
  );
  const modelos = (r.results ?? []).map((x): ModeloAchado => {
    const { licenca, comercial } = licencaSketchfab(x.license);
    const fotos = fotosSketchfab(x.thumbnails);
    return {
      fonte: "sketchfab",
      titulo: x.name,
      link: x.viewerUrl || `https://sketchfab.com/3d-models/${x.uid}`,
      imagem: fotos[fotos.length - 1] ?? fotos[0] ?? "",
      autor: x.user?.username || x.user?.displayName || "",
      licenca,
      comercial,
      downloads: x.viewCount ?? 0,
      curtidas: x.likeCount ?? 0,
    };
  });
  return { modelos, status: statusDe(modelos.length) };
}

async function buscaThingiverse(q: string): Promise<ResultadoFonte> {
  const token = (await getSettings(["thingiverse.token"]))["thingiverse.token"].trim();
  if (!token) return { modelos: [], status: "precisa da chave (Configurações › Integrações)" };
  const r = await json<{ hits?: { id: number; name: string; public_url?: string; thumbnail?: string; preview_image?: string; like_count?: number; collect_count?: number; creator?: { name?: string } }[] }>(
    `https://api.thingiverse.com/search/${encodeURIComponent(q)}/?type=things&per_page=${POR_FONTE}&sort=popular`,
    { headers: { Authorization: `Bearer ${token}` } },
    "Thingiverse",
  );
  const modelos = (r.hits ?? []).map(
    (h): ModeloAchado => ({
      fonte: "thingiverse",
      titulo: h.name,
      link: h.public_url || `https://www.thingiverse.com/thing:${h.id}`,
      imagem: h.preview_image || h.thumbnail || "",
      autor: h.creator?.name ?? "",
      licenca: "",
      comercial: null,
      downloads: h.collect_count ?? 0,
      curtidas: h.like_count ?? 0,
    }),
  );
  return { modelos, status: statusDe(modelos.length) };
}

async function buscaCults(q: string): Promise<ResultadoFonte> {
  const s = await getSettings(["cults.usuario", "cults.chave"]);
  if (!s["cults.usuario"] || !s["cults.chave"]) return { modelos: [], status: "precisa da chave (Configurações › Integrações)" };
  const auth = Buffer.from(`${s["cults.usuario"].trim()}:${s["cults.chave"].trim()}`).toString("base64");
  const r = await json<{ data?: { creationsSearchBatch?: { results?: { name: string; url: string; illustrationImageUrl?: string; license?: { code?: string; name?: string }; creator?: { nick?: string }; downloadsCount?: number; likesCount?: number }[] } }; errors?: { message: string }[] }>(
    "https://cults3d.com/graphql",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        query: `query($q: String!, $n: Int) { creationsSearchBatch(query: $q, limit: $n) { results { name(locale: PT) url(locale: PT) illustrationImageUrl license { code name(locale: PT) } creator { nick } downloadsCount likesCount } } }`,
        variables: { q, n: POR_FONTE },
      }),
    },
    "Cults",
  );
  if (r.errors?.length && !r.data?.creationsSearchBatch) throw new Error(r.errors[0]!.message);
  const modelos = (r.data?.creationsSearchBatch?.results ?? []).map((c): ModeloAchado => {
    const lic = licencaPt([c.license?.code, c.license?.name].filter(Boolean).join(" "));
    return {
      fonte: "cults",
      titulo: c.name,
      link: c.url,
      imagem: c.illustrationImageUrl ?? "",
      autor: c.creator?.nick ?? "",
      licenca: lic,
      comercial: licencaComercial(lic),
      downloads: c.downloadsCount ?? 0,
      curtidas: c.likesCount ?? 0,
    };
  });
  return { modelos, status: statusDe(modelos.length) };
}

async function buscaMyMiniFactory(q: string): Promise<ResultadoFonte> {
  const chave = (await getSettings(["myminifactory.chave"]))["myminifactory.chave"].trim();
  if (!chave) return { modelos: [], status: "precisa da chave (Configurações › Integrações)" };
  const r = await json<{ items?: { id: number; name: string; url?: string; images?: { thumbnail?: { url?: string }; standard?: { url?: string } }[]; designer?: { username?: string; name?: string }; likes?: number; views?: number; license?: string; licenses?: { type?: string; value?: boolean }[] }[] }>(
    `https://www.myminifactory.com/api/v2/search?q=${encodeURIComponent(q)}&per_page=${POR_FONTE}&key=${encodeURIComponent(chave)}`,
    {},
    "MyMiniFactory",
  );
  const modelos = (r.items ?? []).map((o): ModeloAchado => {
    const comercialMMF = o.licenses?.find((l) => /commercial/i.test(l.type ?? ""))?.value;
    return {
      fonte: "myminifactory",
      titulo: o.name,
      link: o.url || `https://www.myminifactory.com/object/${o.id}`,
      imagem: o.images?.[0]?.standard?.url || o.images?.[0]?.thumbnail?.url || "",
      autor: o.designer?.username || o.designer?.name || "",
      licenca: comercialMMF === true ? "Uso comercial permitido" : comercialMMF === false ? "Sem uso comercial" : licencaPt(o.license ?? ""),
      comercial: comercialMMF ?? licencaComercial(o.license ?? ""),
      downloads: o.views ?? 0,
      curtidas: o.likes ?? 0,
    };
  });
  return { modelos, status: statusDe(modelos.length) };
}

const BUSCAS: Record<FonteModelo, (q: string) => Promise<ResultadoFonte>> = {
  makerworld: buscaMakerWorld,
  printables: buscaPrintables,
  sketchfab: buscaSketchfab,
  thingiverse: buscaThingiverse,
  cults: buscaCults,
  myminifactory: buscaMyMiniFactory,
};

/** Pesquisa um termo (já em inglês) nos 6 sites ao mesmo tempo. */
async function buscarTermo(q: string) {
  const resultados = await Promise.all(
    FONTES_MODELO.map(async (f) => [f, await BUSCAS[f](q).catch((e) => ({ modelos: [], status: erroDe(e) }))] as const),
  );
  return Object.fromEntries(resultados) as Record<FonteModelo, ResultadoFonte>;
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

/**
 * Procura modelos nos 6 sites (você digita em português; vai traduzido por dentro) e devolve TODOS (todas as licenças),
 * com como foi em cada site. Títulos voltam em português. Ordem: mais baixados primeiro, intercalando os sites.
 */
export async function buscarModelosDetalhado(termo: string, limite = 60): Promise<{ modelos: ModeloAchado[]; fontes: Partial<Record<FonteModelo, string>> }> {
  const q = termo.trim().slice(0, 80);
  if (!q) return { modelos: [], fontes: {} };
  const [ingles] = await traduzir([q], "en");
  const termos = [...new Set([ingles!, q].map((t) => t.toLowerCase()))];
  const porFonte = new Map<FonteModelo, ModeloAchado[]>();
  const fontes: Partial<Record<FonteModelo, string>> = {};
  const vistos = new Set<string>();
  for (const t of termos) {
    const r = await buscarTermo(t);
    for (const f of FONTES_MODELO) {
      const lista = porFonte.get(f) ?? [];
      for (const m of r[f].modelos) if (!vistos.has(m.link)) vistos.add(m.link) && lista.push(m);
      porFonte.set(f, lista);
      // Fica o melhor status entre as duas pesquisas (a em português costuma achar menos).
      if (!fontes[f] || /^\d/.test(r[f].status)) fontes[f] = lista.length ? statusDe(lista.length) : r[f].status;
    }
  }
  // Intercala os sites (mais baixados de cada um primeiro), para nenhum site sumir da lista.
  const filas = FONTES_MODELO.map((f) => (porFonte.get(f) ?? []).sort((a, b) => b.downloads - a.downloads));
  const todos: ModeloAchado[] = [];
  for (let i = 0; todos.length < limite && filas.some((x) => x.length > i); i++) for (const fila of filas) if (fila[i] && todos.length < limite) todos.push(fila[i]!);
  const titulos = await traduzir(todos.map((m) => m.titulo), "pt");
  return { modelos: todos.map((m, i) => ({ ...m, titulo: titulos[i] ?? m.titulo })), fontes };
}

/** Só os modelos (usada pelo plano da IA): os que a licença deixa vender primeiro. */
export async function buscarModelos(termo: string, limite = 6): Promise<ModeloAchado[]> {
  const { modelos } = await buscarModelosDetalhado(termo, 60);
  const peso = (m: ModeloAchado) => (m.comercial === true ? 2 : m.comercial === null ? 1 : 0);
  return [...modelos].sort((a, b) => peso(b) - peso(a) || b.downloads - a.downloads).slice(0, limite);
}

/** Título e nomes dos perfis do modelo lido em português (a descrição a IA já reescreve ao cadastrar). */
export async function emPortugues(m: Modelo3d): Promise<Modelo3d> {
  const [titulo, ...perfis] = await traduzir([m.titulo, ...m.perfis.map((p) => p.titulo)], "pt");
  return { ...m, titulo: titulo ?? m.titulo, perfis: m.perfis.map((p, i) => ({ ...p, titulo: perfis[i] ?? p.titulo })) };
}
