import "server-only";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { MAX_VIDEO_AFILIADO, PASTA_AFILIADOS } from "@/lib/uploads";

const YTDLP = process.env.YTDLP_BIN || "yt-dlp";

/** Roda um programa e devolve a saída; erro com o fim do stderr quando o código de saída não é 0. */
function rodar(cmd: string, args: string[], tempoMs: number) {
  return new Promise<string>((ok, falha) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    const t = setTimeout(() => p.kill("SIGKILL"), tempoMs);
    p.on("error", (e) => {
      clearTimeout(t);
      falha(new Error((e as NodeJS.ErrnoException).code === "ENOENT" ? `${cmd} não está instalado no servidor.` : e.message));
    });
    p.on("close", (codigo) => {
      clearTimeout(t);
      if (codigo === 0) ok(out);
      else falha(new Error(err.split("\n").filter((l) => /ERROR|error/.test(l)).pop()?.replace(/^.*ERROR:\s*/, "") || err.trim().split("\n").pop() || `${cmd} saiu com código ${codigo}`));
    });
  });
}

/** Duração em segundos (ffprobe); 0 se não conseguir ler. */
export async function duracaoVideo(caminho: string) {
  const out = await rodar("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", caminho], 30_000).catch(() => "0");
  return Math.round(Number(out.trim()) || 0);
}

/** Rede social do link, para mostrar na lista e explicar os erros. */
export function redeDoLink(url: string) {
  const h = url.toLowerCase();
  if (h.includes("tiktok")) return "TikTok";
  if (h.includes("instagram")) return "Instagram";
  if (h.includes("threads.")) return "Threads";
  if (h.includes("facebook") || h.includes("fb.watch") || h.includes("fb.com")) return "Facebook";
  if (h.includes("youtu")) return "YouTube";
  if (h.includes("shopee") || h.includes("shp.ee")) return "Shopee";
  if (h.includes("kwai")) return "Kwai";
  if (h.includes("pinterest") || h.includes("pin.it")) return "Pinterest";
  if (h.includes("x.com") || h.includes("twitter")) return "X";
  return "Link";
}

/** Mensagem do yt-dlp em português, com o que fazer. */
function explicarErro(msg: string, url: string) {
  const rede = redeDoLink(url);
  if (/login|sign in|cookies|rate-limit|private|authenticat|checkpoint/i.test(msg))
    return `${rede} pediu login para liberar este vídeo. Cole os cookies da rede em Configurações › Integrações › Conversor de vídeo e tente de novo. (${msg.slice(0, 160)})`;
  if (/unsupported url/i.test(msg)) return `Esse tipo de link não é suportado (${rede}). Use o link do próprio vídeo/post. (${msg.slice(0, 120)})`;
  if (/no video|there is no video|not a video/i.test(msg)) return "Esse post não tem vídeo (é foto ou texto).";
  if (/max-filesize|larger than/i.test(msg)) return "O vídeo passa de 300 MB.";
  return msg;
}

/** Arquivo temporário com os cookies das redes (Configurações), ou null se não houver. */
async function arquivoCookies() {
  const { "videos.cookies": cookies } = await getSettings(["videos.cookies"]);
  if (!cookies.trim()) return null;
  const caminho = `${tmpdir()}/cookies-${randomBytes(6).toString("hex")}.txt`;
  await writeFile(caminho, cookies.replace(/\r\n/g, "\n").trim() + "\n", { mode: 0o600 });
  return caminho;
}

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Cabeçalho Cookie com os cookies (cookies.txt) dos domínios pedidos. */
function cookiesDe(texto: string, dominios: string[]) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^#HttpOnly_/, "").split("\t"))
    .filter((c) => c.length >= 7 && dominios.some((d) => c[0]!.toLowerCase().includes(d)))
    .map((c) => `${c[5]}=${c[6]}`)
    .join("; ");
}

/**
 * Deixa o MP4 compatível com qualquer celular/editor (Shopee, CapCut...) sem perder qualidade: se o vídeo veio em outro
 * codec (HEVC, VP9, AV1), recodifica em H.264 na mesma resolução (CRF 18 ≈ visualmente sem perda). Sempre põe o índice no
 * começo do arquivo (abre e avança rápido no player).
 */
async function compatibilizar(caminho: string) {
  const codec = (await rodar("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", caminho], 30_000).catch(() => "")).trim();
  const temp = caminho.replace(/\.mp4$/, ".tmp.mp4");
  const video = codec === "h264" ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"];
  try {
    await rodar("ffmpeg", ["-y", "-v", "error", "-i", caminho, ...video, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", temp], 20 * 60_000);
    await rename(temp, caminho);
  } catch {
    await rm(temp, { force: true });
  }
}

/**
 * Threads não é suportado pelo yt-dlp: abre o post com a sua sessão (cookies de Configurações), como o navegador
 * logado faz, e pega o vídeo de maior resolução do próprio post.
 */
async function baixarThreads(url: string, base: string) {
  // Aceita threads.com/threads.net, /@perfil/post/CODIGO, /t/CODIGO, /post/CODIGO/media, com ou sem ?xmt=...
  const codigo = url.match(/\/(?:post|t)\/([\w-]{6,})/)?.[1];
  if (!codigo) throw new Error("Unsupported URL: abra o post no Threads, toque em Compartilhar › Copiar link e cole aqui.");
  const { "videos.cookies": todos } = await getSettings(["videos.cookies"]);
  const cookie = cookiesDe(todos, ["threads.", "instagram."]);
  if (!cookie) throw new Error("login required: o Threads só mostra o vídeo para quem está logado.");
  const perfil = url.match(/threads\.(?:com|net)\/(@[\w.]+)/)?.[1];
  const limpo = perfil ? `https://www.threads.com/${perfil}/post/${codigo}` : `https://www.threads.com/t/${codigo}`;
  const html = await fetch(limpo, { headers: { "User-Agent": NAVEGADOR, Cookie: cookie, "Accept-Language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(30_000) }).then((r) => r.text());
  // O post vem num JSON dentro da página: o vídeo do post é o "video_versions" mais perto do código dele.
  const posCodigo = html.indexOf(`"code":"${codigo}"`);
  const versoes = [...html.matchAll(/"video_versions":(\[[^\]]*\])/g)].map((m) => ({ pos: m.index ?? 0, lista: JSON.parse(m[1]!) as { url: string; width?: number; height?: number }[] }));
  if (!versoes.length) throw new Error(posCodigo < 0 ? "login required: a sessão do Threads expirou (atualize os cookies)." : "There is no video in this post");
  const perto = versoes.sort((a, b) => Math.abs(a.pos - posCodigo) - Math.abs(b.pos - posCodigo))[0]!.lista.filter((v) => v.url);
  const melhor = perto.sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
  if (!melhor) throw new Error("There is no video in this post");
  const res = await fetch(melhor.url, { headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`O Threads não entregou o vídeo (${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_AFILIADO) throw new Error("max-filesize");
  const arquivo = `${base}.mp4`;
  await pipeline(Readable.fromWeb(res.body as WebReadableStream), createWriteStream(`${PASTA_AFILIADOS}/${arquivo}`));
  const titulo = html.match(/<meta property="og:description" content="([^"]{1,200})/)?.[1] ?? `Threads ${codigo}`;
  return { arquivo, titulo: titulo.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&quot;/g, '"').replace(/&amp;/g, "&") };
}

// Um download por vez: vários links de uma vez não derrubam o servidor nem disparam bloqueio das redes.
let fila: Promise<unknown> = Promise.resolve();
export function baixarNaFila(videoId: number, url: string) {
  fila = fila.then(() => baixarVideo(videoId, url)).catch(() => undefined);
}

/**
 * Baixa o vídeo do link (TikTok, Instagram, YouTube, Facebook, Threads, Shopee e outros que o yt-dlp suporta) em MP4.
 * Roda em segundo plano: o registro fica "baixando" e vira "bruto" (ou "erro" com a mensagem).
 */
export async function baixarVideo(videoId: number, url: string) {
  await mkdir(PASTA_AFILIADOS, { recursive: true });
  const base = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  const cookies = await arquivoCookies().catch(() => null);
  try {
    if (redeDoLink(url) === "Threads") {
      const { arquivo, titulo } = await baixarThreads(url, base);
      const caminho = `${PASTA_AFILIADOS}/${arquivo}`;
      await compatibilizar(caminho);
      await db
        .update(afiliadosVideos)
        .set({ arquivo, tamanho: (await stat(caminho)).size, duracaoS: await duracaoVideo(caminho), status: "bruto", erro: "", titulo })
        .where(eq(afiliadosVideos.id, videoId));
      return;
    }
    const info = await rodar(
      YTDLP,
      [
        "--no-playlist",
        "--no-progress",
        "--restrict-filenames",
        "--max-filesize",
        String(MAX_VIDEO_AFILIADO),
        // Maior qualidade: maior resolução e fps primeiro; entre iguais, H.264 + AAC (abre em qualquer celular e editor).
        "-f",
        "bv*+ba/b",
        "-S",
        "res,fps,vcodec:h264,acodec:aac",
        "--merge-output-format",
        "mp4",
        "-o",
        `${PASTA_AFILIADOS}/${base}.%(ext)s`,
        "--print",
        "after_move:%(title)s",
        ...(cookies ? ["--cookies", cookies] : []),
        url,
      ],
      10 * 60_000,
    );
    const arquivo = (await readdir(PASTA_AFILIADOS)).find((f) => f.startsWith(`${base}.`));
    if (!arquivo) throw new Error("O vídeo não foi baixado (formato não suportado ou acima de 300 MB).");
    const caminho = `${PASTA_AFILIADOS}/${arquivo}`;
    if (arquivo.endsWith(".mp4")) await compatibilizar(caminho);
    const titulo = info.trim().split("\n").pop()?.slice(0, 200) ?? "";
    await db
      .update(afiliadosVideos)
      .set({ arquivo, tamanho: (await stat(caminho)).size, duracaoS: await duracaoVideo(caminho), status: "bruto", erro: "", ...(titulo ? { titulo } : {}) })
      .where(eq(afiliadosVideos.id, videoId));
  } catch (e) {
    for (const f of (await readdir(PASTA_AFILIADOS).catch(() => [])).filter((x) => x.startsWith(`${base}.`))) {
      await rm(`${PASTA_AFILIADOS}/${f}`, { force: true });
    }
    await db
      .update(afiliadosVideos)
      .set({ status: "erro", erro: explicarErro((e as Error).message, url).slice(0, 500) })
      .where(eq(afiliadosVideos.id, videoId));
  } finally {
    if (cookies) await rm(cookies, { force: true });
  }
}
