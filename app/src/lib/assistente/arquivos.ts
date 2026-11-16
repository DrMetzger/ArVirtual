import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import type { AnexoIa } from "@/db/schema";
import type { Parte } from "@/lib/gemini";
import { UPLOAD_DIR } from "@/lib/uploads";

// Anexos do assistente ficam fora da pasta pública de uploads: só abrem com login.
export const PASTA_IA = `${UPLOAD_DIR}/ia`;
export const NOME_ARQUIVO_IA = /^[a-z0-9-]+\.[a-z0-9]{1,5}$/;

const MB = 1024 * 1024;
/** Imagens e PDF vão inteiros para o Gemini (limite de ~20 MB por pedido). */
const INLINE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};
const MAX_INLINE = 7 * MB;
/** STL/3MF são analisados aqui (medidas, volume, peso estimado) e só o resumo vai para a IA. */
const MAX_MODELO = 60 * MB;
const MAX_TEXTO = 3 * MB;
const LIMITE_CARACTERES = 120_000;
const TEXTO_EXT = /\.(txt|csv|tsv|md|json|xml|html?|log|ini|cfg|conf|yaml|yml|ino|c|cpp|h|py|js|ts|sql|prw|tlpp|ch)$/i;

export const TIPOS_ACEITOS =
  "image/*,application/pdf,.stl,.3mf,.gcode,.txt,.csv,.tsv,.md,.json,.xml,.html,.log,.ini,.cfg,.yaml,.yml,.ino,.c,.cpp,.h,.py,.js,.ts,.sql,.prw,.tlpp";

export const mimeDaExtensao = (arquivo: string) =>
  Object.entries(INLINE).find(([, ext]) => arquivo.endsWith(`.${ext}`))?.[0] ?? "application/octet-stream";

async function gravar(dados: Buffer, ext: string) {
  await mkdir(PASTA_IA, { recursive: true });
  const nome = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
  await writeFile(`${PASTA_IA}/${nome}`, dados);
  return nome;
}

/** Imagem gerada pela IA: salva e vira anexo da resposta. */
export async function salvarImagemGerada(img: { mimeType: string; data: string }, i: number): Promise<AnexoIa> {
  const ext = INLINE[img.mimeType] ?? "png";
  const dados = Buffer.from(img.data, "base64");
  return { nome: `imagem-${i + 1}.${ext}`, tipo: img.mimeType, arquivo: await gravar(dados, ext), tamanho: dados.length };
}

/** Arquivo criado pela IA (ex.: desenho .svg) como anexo da resposta. */
export async function salvarArquivoGerado(dados: Buffer, nome: string, tipo: string): Promise<AnexoIa> {
  const ext = nome.split(".").pop() ?? "bin";
  return { nome, tipo, arquivo: await gravar(dados, ext), tamanho: dados.length };
}

/** Valida, salva e prepara o arquivo enviado na conversa. */
export async function salvarAnexo(file: File): Promise<AnexoIa> {
  const nomeLower = file.name.toLowerCase();
  const dados = Buffer.from(await file.arrayBuffer());
  const base = { nome: file.name.slice(0, 120), tamanho: file.size };
  const tipoInline = INLINE[file.type] ? file.type : Object.keys(INLINE).find((t) => nomeLower.endsWith(`.${INLINE[t]}`) || (t === "image/jpeg" && nomeLower.endsWith(".jpeg")));

  if (tipoInline) {
    if (file.size > MAX_INLINE) throw new Error(`${file.name} passa de 7 MB (limite do Gemini por arquivo).`);
    return { ...base, tipo: tipoInline, arquivo: await gravar(dados, INLINE[tipoInline]!) };
  }
  if (nomeLower.endsWith(".stl")) {
    if (file.size > MAX_MODELO) throw new Error(`${file.name} passa de 60 MB.`);
    return { ...base, tipo: "model/stl", arquivo: await gravar(dados, "stl"), texto: analisarStl(dados) };
  }
  if (nomeLower.endsWith(".3mf")) {
    if (file.size > MAX_MODELO) throw new Error(`${file.name} passa de 60 MB.`);
    return { ...base, tipo: "model/3mf", arquivo: await gravar(dados, "3mf"), texto: analisar3mf(dados) };
  }
  if (nomeLower.endsWith(".gcode")) {
    if (file.size > MAX_MODELO) throw new Error(`${file.name} passa de 60 MB.`);
    return { ...base, tipo: "text/x-gcode", arquivo: await gravar(dados, "gcode"), texto: resumirGcode(dados.toString("utf8")) };
  }
  if (TEXTO_EXT.test(nomeLower) || file.type.startsWith("text/") || file.type === "application/json" || file.type === "application/xml") {
    if (file.size > MAX_TEXTO) throw new Error(`${file.name} passa de 3 MB.`);
    let texto = dados.toString("utf8");
    if (texto.length > LIMITE_CARACTERES) texto = `${texto.slice(0, LIMITE_CARACTERES)}\n[... arquivo cortado: ${texto.length} caracteres no total]`;
    const ext = nomeLower.match(/\.([a-z0-9]{1,5})$/)?.[1] ?? "txt";
    return { ...base, tipo: file.type || "text/plain", arquivo: await gravar(dados, ext), texto };
  }
  throw new Error(`${file.name}: formato não suportado. Envie imagem, PDF, STL, 3MF, G-code ou texto (CSV, XML, TXT...).`);
}

/** Parte que vai para o Gemini; `inline` falso troca imagem/PDF por uma referência (economiza o limite do pedido). */
export async function parteDoAnexo(a: AnexoIa, inline: boolean): Promise<Parte> {
  if (a.texto !== undefined) return { text: `[Arquivo anexado: ${a.nome}]\n${a.texto}` };
  if (!inline) return { text: `[Arquivo anexado anteriormente: ${a.nome} (${a.tipo})]` };
  try {
    return { inlineData: { mimeType: a.tipo, data: (await readFile(`${PASTA_IA}/${a.arquivo}`)).toString("base64") } };
  } catch {
    return { text: `[Arquivo ${a.nome} não está mais disponível]` };
  }
}

// ---------- Modelos 3D ----------
export type Malha = { min: number[]; max: number[]; volume: number; area: number; triangulos: number };

function novaMalha(): Malha {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], volume: 0, area: 0, triangulos: 0 };
}

function somarTriangulo(m: Malha, a: number[], b: number[], c: number[]) {
  for (const v of [a, b, c]) {
    for (let k = 0; k < 3; k++) {
      if (v[k]! < m.min[k]!) m.min[k] = v[k]!;
      if (v[k]! > m.max[k]!) m.max[k] = v[k]!;
    }
  }
  // Volume com sinal (teorema da divergência) e área da superfície.
  m.volume += (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) / 6;
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  m.area += Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!) / 2;
  m.triangulos++;
}

const f1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function descreverMalha(m: Malha) {
  if (!m.triangulos) return "Não encontrei triângulos no modelo.";
  const dim = [0, 1, 2].map((k) => m.max[k]! - m.min[k]!);
  const volCm3 = Math.abs(m.volume) / 1000;
  // Estimativa de fatiamento padrão: 2 paredes de 0,42 mm + 15% de preenchimento.
  const casca = Math.min(Math.abs(m.volume), m.area * 0.84) / 1000;
  const miolo = Math.max(0, volCm3 - casca);
  const pesoPla = (casca + miolo * 0.15) * 1.24;
  const cabe = dim.every((d) => d <= 180);
  return [
    `Malha com ${m.triangulos.toLocaleString("pt-BR")} triângulos.`,
    `Medidas (X × Y × Z): ${dim.map(f1).join(" × ")} mm.`,
    `Volume sólido: ${f1(volCm3)} cm³; área da superfície: ${f1(m.area / 100)} cm².`,
    `Peso estimado em PLA (2 paredes, 15% de preenchimento): ~${f1(pesoPla)} g (100% sólido: ${f1(volCm3 * 1.24)} g; PETG ≈ ×1,02).`,
    `Cabe na mesa da A1 mini (180 × 180 × 180 mm) na orientação original: ${cabe ? "sim" : "não"}.`,
    "Valores calculados pelo sistema a partir do arquivo (o fatiador dá o número exato).",
  ].join("\n");
}

export function analisarStl(buf: Buffer): string {
  return `Análise do STL:\n${descreverMalha(malhaStl(buf))}`;
}

/** Malha de um STL (binário ou texto): medidas, volume e área. */
export function malhaStl(buf: Buffer): Malha {
  const m = novaMalha();
  const n = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
  const binario = buf.length >= 84 && 84 + n * 50 === buf.length;
  if (binario) {
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      const v = (k: number) => [buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)];
      somarTriangulo(m, v(0), v(1), v(2));
    }
  } else {
    const vs = [...buf.toString("utf8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
    for (let i = 0; i + 2 < vs.length; i += 3) somarTriangulo(m, vs[i]!, vs[i + 1]!, vs[i + 2]!);
  }
  return m;
}

/** Medidas (mm) da malha, em X × Y × Z; null se não há triângulos. */
export function medidasMalha(m: Malha) {
  return m.triangulos ? [0, 1, 2].map((k) => Math.round((m.max[k]! - m.min[k]!) * 10) / 10) : null;
}

/** Peso estimado em PLA (g) com 2 paredes e 15% de preenchimento. */
export function pesoEstimadoPla(m: Malha) {
  const volCm3 = Math.abs(m.volume) / 1000;
  const casca = Math.min(Math.abs(m.volume), m.area * 0.84) / 1000;
  return Math.round((casca + Math.max(0, volCm3 - casca) * 0.15) * 1.24);
}

export type Fatiamento3mf = { tempoS: number; pesoG: number; filamentos: { tipo: string; cor: string; gramas: number }[] };

/**
 * 3MF (Bambu Studio / OrcaSlicer): malha de todos os objetos e, se o arquivo foi fatiado (Exportar arquivo fatiado),
 * tempo, peso e gramas de cada filamento; sem fatiamento, as cores/tipos dos filamentos do projeto.
 */
export function ler3mf(buf: Buffer): { malha: Malha; fatiamento: Fatiamento3mf | null; cores: { tipo: string; cor: string }[]; impressora: string } {
  const arquivos = lerZip(buf, (n) => /^3D\/.*\.model$/i.test(n) || /Metadata\/(slice_info\.config|project_settings\.config)$/i.test(n));
  const m = novaMalha();
  for (const [nome, dados] of arquivos) {
    if (!nome.endsWith(".model")) continue;
    for (const obj of dados.toString("utf8").split(/<object\b/).slice(1)) {
      const vs = [...obj.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
      for (const t of obj.matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g)) {
        const a = vs[Number(t[1])];
        const b = vs[Number(t[2])];
        const c = vs[Number(t[3])];
        if (a && b && c) somarTriangulo(m, a, b, c);
      }
    }
  }
  let fatiamento: Fatiamento3mf | null = null;
  const fatiado = [...arquivos].find(([n]) => /slice_info\.config$/i.test(n))?.[1]?.toString("utf8");
  if (fatiado) {
    // Uma <plate> por mesa: soma tempo, peso e gramas por cor de todas.
    let tempoS = 0;
    let pesoG = 0;
    const porCor = new Map<string, { tipo: string; cor: string; gramas: number }>();
    for (const placa of fatiado.split(/<plate>/).slice(1)) {
      tempoS += Number(placa.match(/key="prediction"\s+value="([\d.]+)"/)?.[1] ?? 0);
      pesoG += Number(placa.match(/key="weight"\s+value="([\d.]+)"/)?.[1] ?? 0);
      for (const f of placa.matchAll(/<filament\b([^>]*)\/?>/g)) {
        const at = (k: string) => f[1]!.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? "";
        const cor = at("color").toUpperCase();
        const tipo = at("type");
        const chave = `${tipo}|${cor}`;
        const atual = porCor.get(chave) ?? { tipo, cor, gramas: 0 };
        atual.gramas += Number(at("used_g") || 0);
        porCor.set(chave, atual);
      }
    }
    if (tempoS || pesoG) fatiamento = { tempoS, pesoG: Math.round(pesoG), filamentos: [...porCor.values()].filter((f) => f.gramas > 0).map((f) => ({ ...f, gramas: Math.round(f.gramas * 10) / 10 })) };
  }
  let cores: { tipo: string; cor: string }[] = [];
  let impressora = "";
  const projeto = [...arquivos].find(([n]) => /project_settings\.config$/i.test(n))?.[1]?.toString("utf8");
  if (projeto) {
    try {
      const cfg = JSON.parse(projeto) as Record<string, unknown>;
      const lista = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(";") : []);
      const tipos = lista(cfg.filament_type);
      cores = lista(cfg.filament_colour).map((c, i) => ({ tipo: tipos[i] ?? tipos[0] ?? "PLA", cor: c.toUpperCase() }));
      impressora = String(cfg.printer_model ?? "");
    } catch {
      /* config fora do padrão */
    }
  }
  return { malha: m, fatiamento, cores, impressora };
}

/** Leitor mínimo de ZIP (o 3MF é um ZIP): devolve os arquivos pedidos. */
export function lerZip(buf: Buffer, quer: (nome: string) => boolean) {
  const out = new Map<string, Buffer>();
  let fimDir = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fimDir = i;
      break;
    }
  }
  if (fimDir < 0) throw new Error("3MF inválido.");
  let p = buf.readUInt32LE(fimDir + 16);
  const total = buf.readUInt16LE(fimDir + 10);
  for (let e = 0; e < total && buf.readUInt32LE(p) === 0x02014b50; e++) {
    const metodo = buf.readUInt16LE(p + 10);
    const tamanho = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenComent = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + lenNome);
    if (quer(nome)) {
      const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const bruto = buf.subarray(ini, ini + tamanho);
      out.set(nome, metodo === 8 ? inflateRawSync(bruto) : bruto);
    }
    p += 46 + lenNome + lenExtra + lenComent;
  }
  return out;
}

const CHAVES_PROJETO = [
  "printer_model", "printer_settings_id", "print_settings_id", "filament_settings_id", "filament_type", "filament_colour", "layer_height",
  "initial_layer_print_height", "wall_loops", "top_shell_layers", "bottom_shell_layers", "sparse_infill_density", "sparse_infill_pattern",
  "enable_support", "support_type", "nozzle_temperature", "nozzle_temperature_initial_layer", "hot_plate_temp", "textured_plate_temp",
  "curr_bed_type", "brim_type", "nozzle_diameter", "outer_wall_speed", "inner_wall_speed", "sparse_infill_speed", "prime_tower_width", "enable_prime_tower",
];

export function analisar3mf(buf: Buffer): string {
  try {
    const arquivos = lerZip(buf, (n) => /^3D\/.*\.model$/i.test(n) || /Metadata\/(slice_info\.config|project_settings\.config)$/i.test(n));
    const partes: string[] = ["Análise do 3MF:"];
    const m = novaMalha();
    for (const [nome, dados] of arquivos) {
      if (!nome.endsWith(".model")) continue;
      const xml = dados.toString("utf8");
      // Cada objeto: vértices e triângulos (índices). Transformações dos itens são ignoradas.
      for (const obj of xml.split(/<object\b/).slice(1)) {
        const vs = [...obj.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
        for (const t of obj.matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g)) {
          const a = vs[Number(t[1])];
          const b = vs[Number(t[2])];
          const c = vs[Number(t[3])];
          if (a && b && c) somarTriangulo(m, a, b, c);
        }
      }
    }
    if (m.triangulos) partes.push(descreverMalha(m));
    const fatiado = [...arquivos].find(([n]) => /slice_info\.config$/i.test(n))?.[1]?.toString("utf8");
    if (fatiado) partes.push(`Resultado do fatiamento (Bambu Studio, slice_info.config):\n${fatiado.slice(0, 8000)}`);
    const projeto = [...arquivos].find(([n]) => /project_settings\.config$/i.test(n))?.[1]?.toString("utf8");
    if (projeto) {
      try {
        const cfg = JSON.parse(projeto) as Record<string, unknown>;
        const linhas = CHAVES_PROJETO.filter((k) => cfg[k] !== undefined).map((k) => `${k}: ${JSON.stringify(cfg[k])}`);
        if (linhas.length) partes.push(`Configurações do projeto:\n${linhas.join("\n")}`);
      } catch {
        /* config fora do padrão: ignora */
      }
    }
    return partes.length > 1 ? partes.join("\n\n") : "Análise do 3MF: não encontrei malha nem dados de fatiamento no arquivo.";
  } catch (e) {
    return `Análise do 3MF: não consegui ler o arquivo (${(e as Error).message}).`;
  }
}

/** G-code: só os comentários de cabeçalho e de estatísticas (tempo, filamento, temperaturas). */
export function resumirGcode(texto: string): string {
  const linhas = texto.split(/\r?\n/);
  const comentarios = (l: string[]) => l.filter((x) => x.startsWith(";") && /[:=]/.test(x));
  const cabeca = comentarios(linhas.slice(0, 600));
  const cauda = comentarios(linhas.slice(-800));
  const resumo = [...new Set([...cabeca, ...cauda])].join("\n").slice(0, 20_000);
  return `Resumo do G-code (${linhas.length.toLocaleString("pt-BR")} linhas; só comentários de configuração e estatísticas):\n${resumo || "(sem comentários de configuração)"}`;
}
