"use client";

import { ChevronLeft, ChevronRight, Download, GripVertical, ImagePlus, Star, X } from "lucide-react";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useMidias } from "./midias";

/** Imagens do produto: arraste para reordenar (ou use as setas). A primeira é a capa do anúncio. */
export function ImagensField({ iniciais, produtoId, sku }: { iniciais: string[]; produtoId?: string; sku?: string }) {
  const m = useMidias(iniciais, "novasImagens");
  const botao = "grid size-6 place-items-center rounded-full bg-black/65 text-white hover:bg-black/85 disabled:opacity-30";

  return (
    <Card>
      <CardHeader
        title="Imagens"
        description="JPG, PNG ou WEBP até 5 MB. Arraste para mudar a ordem; a primeira é a capa do anúncio."
        action={
          produtoId && iniciais.length ? (
            <a href={`/api/produtos/${produtoId}/midias?tipo=imagens`} className={buttonClass("outline", "sm")} title="Baixar todas as fotos (.zip)">
              <Download /> Baixar todas
            </a>
          ) : undefined
        }
      />
      <div className="grid gap-4 p-5">
        <input type="hidden" name="ordemImagens" value={m.ordem} />
        <input ref={m.inputArquivos} type="file" name="novasImagens" multiple className="hidden" tabIndex={-1} aria-hidden />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {m.itens.map((img, i) => (
            <div
              key={img.chave}
              {...m.arrastavel(i)}
              className={cn(
                "group relative aspect-square cursor-grab overflow-hidden rounded-xl border bg-surface-2 active:cursor-grabbing",
                img.arquivo ? "border-dashed border-gold" : "border-border",
                m.arrastando === i && "opacity-40 ring-2 ring-gold",
              )}
            >
              <img src={img.url} alt="" draggable={false} className="size-full object-cover" />
              {i === 0 ? (
                <span className="absolute top-1.5 left-1.5 rounded-md bg-gold px-1.5 text-[10px] font-bold text-[#0a1a33]">CAPA</span>
              ) : (
                <GripVertical className="absolute top-1.5 left-1 size-4 text-white drop-shadow opacity-70" />
              )}
              <button type="button" onClick={() => m.remover(i)} className={cn(botao, "absolute top-1.5 right-1.5")} aria-label="Remover imagem">
                <X className="size-3.5" />
              </button>
              {img.arquivo ? null : (
                <a
                  href={`${img.url}?baixar=${encodeURIComponent(`${sku || "foto"}-${String(i + 1).padStart(2, "0")}.${img.url.split(".").pop()}`)}`}
                  className={cn(botao, "absolute top-1.5 right-9")}
                  title="Baixar foto"
                  aria-label="Baixar foto"
                  draggable={false}
                >
                  <Download className="size-3.5" />
                </a>
              )}
              <div className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between">
                <button type="button" onClick={() => m.mover(i, i - 1)} disabled={i === 0} className={botao} aria-label="Mover para a esquerda">
                  <ChevronLeft className="size-4" />
                </button>
                {i > 0 ? (
                  <button
                    type="button"
                    onClick={() => m.mover(i, 0)}
                    className="flex h-6 items-center gap-1 rounded-full bg-black/65 px-2 text-[10px] font-semibold text-white hover:bg-black/85"
                    title="Usar como capa"
                  >
                    <Star className="size-3" /> Capa
                  </button>
                ) : null}
                <button type="button" onClick={() => m.mover(i, i + 1)} disabled={i === m.itens.length - 1} className={botao} aria-label="Mover para a direita">
                  <ChevronRight className="size-4" />
                </button>
              </div>
              {img.arquivo ? <span className="absolute right-1.5 bottom-9 rounded bg-gold/90 px-1 text-[9px] font-bold text-[#0a1a33]">NOVA</span> : null}
            </div>
          ))}
          <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-muted transition hover:border-gold hover:text-gold">
            <span className="grid justify-items-center gap-1 text-xs font-semibold">
              <ImagePlus className="size-6" /> Adicionar
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                m.adicionar(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </Card>
  );
}
