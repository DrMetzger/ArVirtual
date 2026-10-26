"use client";

import { ChevronLeft, ChevronRight, Download, Film, Upload, X } from "lucide-react";
import { useState } from "react";
import { Alert, buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMidias } from "./midias";

/** Vídeos do produto (MP4). A Shopee aceita vídeo direto no anúncio: 10 a 60 s, até 30 MB. Arraste para reordenar. */
export function VideosField({ iniciais, produtoId, sku }: { iniciais: string[]; produtoId?: string; sku?: string }) {
  const m = useMidias(iniciais, "novosVideos");
  const [duracoes, setDuracoes] = useState<Record<string, number>>({});

  const avisos = m.itens
    .filter((v) => v.arquivo)
    .flatMap((v) => {
      const mb = v.arquivo!.size / 1024 / 1024;
      const d = duracoes[v.chave];
      return [
        ...(mb > 30 ? [`${v.arquivo!.name}: ${mb.toFixed(1)} MB passa do limite de 30 MB da Shopee.`] : []),
        ...(d !== undefined && (d < 10 || d > 60) ? [`${v.arquivo!.name}: ${Math.round(d)} s; a Shopee aceita de 10 a 60 segundos.`] : []),
      ];
    });
  const botao = "grid size-6 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 disabled:opacity-30";

  return (
    <Card>
      <CardHeader
        title="Vídeos"
        description="MP4 de 10 a 60 segundos, até 30 MB. Arraste para mudar a ordem; o primeiro vai para o anúncio da Shopee."
        action={
          produtoId && iniciais.length ? (
            <a href={`/api/produtos/${produtoId}/midias?tipo=videos`} className={buttonClass("outline", "sm")} title="Baixar todos os vídeos (.zip)">
              <Download /> Baixar todos
            </a>
          ) : (
            <Film className="size-5 text-gold" />
          )
        }
      />
      <div className="grid gap-4 p-5">
        <input type="hidden" name="ordemVideos" value={m.ordem} />
        <input ref={m.inputArquivos} type="file" name="novosVideos" multiple className="hidden" tabIndex={-1} aria-hidden />
        {m.itens.length ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {m.itens.map((v, i) => (
              <div
                key={v.chave}
                {...m.arrastavel(i)}
                className={cn(
                  "relative cursor-grab overflow-hidden rounded-xl border bg-black active:cursor-grabbing",
                  v.arquivo ? "border-dashed border-gold" : "border-border",
                  m.arrastando === i && "opacity-40 ring-2 ring-gold",
                )}
              >
                <video
                  src={v.url}
                  controls
                  preload="metadata"
                  className="aspect-video w-full"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    setDuracoes((x) => ({ ...x, [v.chave]: d }));
                  }}
                />
                {i === 0 ? <span className="absolute top-1.5 left-1.5 rounded-md bg-gold px-1.5 text-[10px] font-bold text-[#0a1a33]">SHOPEE</span> : null}
                <button type="button" onClick={() => m.remover(i)} className={cn(botao, "absolute top-1.5 right-1.5")} aria-label="Remover vídeo">
                  <X className="size-3.5" />
                </button>
                {v.arquivo ? null : (
                  <a
                    href={`${v.url}?baixar=${encodeURIComponent(`${sku || "video"}-${i + 1}.mp4`)}`}
                    className={cn(botao, "absolute top-1.5 right-9")}
                    title="Baixar vídeo"
                    aria-label="Baixar vídeo"
                    draggable={false}
                  >
                    <Download className="size-3.5" />
                  </a>
                )}
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-white/80">
                  <button type="button" onClick={() => m.mover(i, i - 1)} disabled={i === 0} className={botao} aria-label="Mover para a esquerda">
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-center">
                    {v.arquivo ? `${v.arquivo.name} · ${(v.arquivo.size / 1024 / 1024).toFixed(1)} MB` : `Vídeo ${i + 1}`}
                    {duracoes[v.chave] !== undefined ? ` · ${Math.round(duracoes[v.chave]!)} s` : ""}
                  </span>
                  <button type="button" onClick={() => m.mover(i, i + 1)} disabled={i === m.itens.length - 1} className={botao} aria-label="Mover para a direita">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {avisos.length ? <Alert tone="gold">{avisos.join(" ")}</Alert> : null}
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-5 text-sm font-semibold text-muted transition hover:border-gold hover:text-gold",
            m.itens.length >= 3 && "pointer-events-none opacity-50",
          )}
        >
          <Upload className="size-5" /> Adicionar vídeo (MP4)
          <input
            type="file"
            accept="video/mp4"
            multiple
            className="sr-only"
            onChange={(e) => {
              m.adicionar(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-muted">Até 3 vídeos por produto. Os vídeos sobem junto quando você salva o produto.</p>
      </div>
    </Card>
  );
}
