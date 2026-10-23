"use client";

import { Film, Upload, X } from "lucide-react";
import { useState } from "react";
import { Alert, Card, CardHeader } from "@/components/ui";

type Novo = { url: string; nome: string; mb: number; duracao: number | null };

/** Vídeos do produto (MP4). A Shopee aceita vídeo direto no anúncio: 10 a 60 s, até 30 MB. */
export function VideosField({ iniciais }: { iniciais: string[] }) {
  const [videos, setVideos] = useState(iniciais);
  const [novos, setNovos] = useState<Novo[]>([]);

  function escolher(files: FileList | null) {
    const lista = [...(files ?? [])].map((f) => ({ url: URL.createObjectURL(f), nome: f.name, mb: f.size / 1024 / 1024, duracao: null }));
    setNovos(lista);
  }

  const avisos = novos.flatMap((v) => [
    ...(v.mb > 30 ? [`${v.nome}: ${v.mb.toFixed(1)} MB passa do limite de 30 MB da Shopee.`] : []),
    ...(v.duracao !== null && (v.duracao < 10 || v.duracao > 60) ? [`${v.nome}: ${Math.round(v.duracao)} s; a Shopee aceita de 10 a 60 segundos.`] : []),
  ]);
  const total = videos.length + novos.length;

  return (
    <Card>
      <CardHeader
        title="Vídeos"
        description="MP4 de 10 a 60 segundos, até 30 MB. O primeiro vai para o anúncio da Shopee."
        action={<Film className="size-5 text-gold" />}
      />
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {videos.map((url, i) => (
            <div key={url} className="group relative overflow-hidden rounded-xl border border-border bg-black">
              <video src={url} controls preload="metadata" className="aspect-video w-full" />
              <input type="hidden" name="videosExistentes" value={url} />
              {i === 0 ? <span className="absolute left-1.5 top-1.5 rounded-md bg-gold px-1.5 text-[10px] font-bold text-[#0a1a33]">SHOPEE</span> : null}
              <button
                type="button"
                onClick={() => setVideos(videos.filter((u) => u !== url))}
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                aria-label="Remover vídeo"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {novos.map((v, i) => (
            <div key={v.url} className="overflow-hidden rounded-xl border border-dashed border-gold bg-black">
              <video
                src={v.url}
                controls
                preload="metadata"
                className="aspect-video w-full opacity-90"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  setNovos((l) => l.map((x, j) => (j === i ? { ...x, duracao: d } : x)));
                }}
              />
              <p className="truncate px-2 py-1 text-xs text-white/80">
                {v.nome} · {v.mb.toFixed(1)} MB{v.duracao !== null ? ` · ${Math.round(v.duracao)} s` : ""}
              </p>
            </div>
          ))}
        </div>
        {avisos.length ? <Alert tone="gold">{avisos.join(" ")}</Alert> : null}
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-5 text-sm font-semibold text-muted transition hover:border-gold hover:text-gold ${total >= 3 ? "pointer-events-none opacity-50" : ""}`}
        >
          <Upload className="size-5" /> {novos.length ? "Trocar vídeos escolhidos" : "Adicionar vídeo (MP4)"}
          <input type="file" name="novosVideos" accept="video/mp4" multiple className="sr-only" onChange={(e) => escolher(e.target.files)} />
        </label>
        <p className="text-xs text-muted">Até 3 vídeos por produto. Os vídeos sobem junto quando você salva o produto.</p>
      </div>
    </Card>
  );
}
