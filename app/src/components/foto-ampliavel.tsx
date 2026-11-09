"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Miniatura que, ao tocar, abre a foto grande em tela cheia (toque fora ou Esc fecha). */
export function FotoAmpliavel({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberta]);
  if (!src) return <div className={cn("shrink-0 rounded-lg bg-surface-2", className)} />;
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className={cn("shrink-0 cursor-zoom-in overflow-hidden rounded-lg bg-white", className)} title="Ampliar foto">
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain" />
      </button>
      {aberta ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/85 p-4" onClick={() => setAberta(false)} role="dialog" aria-modal="true">
          <button type="button" className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white" aria-label="Fechar">
            <X className="size-6" />
          </button>
          {/* Foto grande: pede a versão maior quando a CDN permite. */}
          <img src={grande(src)} alt={alt} className="max-h-[85vh] max-w-full rounded-xl bg-white object-contain" />
          {alt ? <p className="mt-3 max-w-xl text-center text-sm text-white">{alt}</p> : null}
        </div>
      ) : null}
    </>
  );
}

/** URL da foto em tamanho maior nas CDNs conhecidas (Shopee "_tn", ML "-I.jpg", Magalu "/90x90/"). */
function grande(src: string) {
  return src
    .replace(/_tn(\.\w+)?$/, "$1")
    .replace(/-[IOV]\.(jpg|webp)$/i, "-O.$1")
    .replace(/\/\d+x\d+\//, "/800x560/");
}
