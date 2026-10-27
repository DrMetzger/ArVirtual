import "server-only";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosVideos } from "@/db/schema";
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

/**
 * Baixa o vídeo do link (TikTok, Instagram, YouTube e outros que o yt-dlp suporta) em MP4.
 * Roda em segundo plano: o registro fica "baixando" e vira "bruto" (ou "erro" com a mensagem).
 */
export async function baixarVideo(videoId: number, url: string) {
  await mkdir(PASTA_AFILIADOS, { recursive: true });
  const base = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  try {
    const info = await rodar(
      YTDLP,
      [
        "--no-playlist",
        "--no-progress",
        "--restrict-filenames",
        "--max-filesize",
        String(MAX_VIDEO_AFILIADO),
        // MP4 com áudio (H.264 quando houver: abre em qualquer celular e editor).
        "-f",
        "bv*[ext=mp4][vcodec^=avc]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
        "--merge-output-format",
        "mp4",
        "-o",
        `${PASTA_AFILIADOS}/${base}.%(ext)s`,
        "--print",
        "after_move:%(title)s",
        url,
      ],
      10 * 60_000,
    );
    const arquivo = (await readdir(PASTA_AFILIADOS)).find((f) => f.startsWith(`${base}.`));
    if (!arquivo) throw new Error("O vídeo não foi baixado (formato não suportado ou acima de 300 MB).");
    const caminho = `${PASTA_AFILIADOS}/${arquivo}`;
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
      .set({ status: "erro", erro: (e as Error).message.slice(0, 500) })
      .where(eq(afiliadosVideos.id, videoId));
  }
}
