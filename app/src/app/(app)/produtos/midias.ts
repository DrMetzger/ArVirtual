"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Lista ordenável de mídias do produto: as já salvas (URL) e as escolhidas agora (arquivo, ainda não enviado).
// A ordem vai para o servidor no campo `campoOrdem` como JSON: "e:<url>" (existente) ou "n:<i>" (i-ésimo arquivo novo).
export type Midia = { chave: string; url: string; arquivo?: File };

export function useMidias(iniciais: string[], campoArquivos: string) {
  const [itens, setItens] = useState<Midia[]>(() => iniciais.map((url) => ({ chave: url, url })));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const inputArquivos = useRef<HTMLInputElement>(null);

  const novos = useMemo(() => itens.filter((i) => i.arquivo), [itens]);
  // O <input type=file> escondido leva os arquivos novos, na ordem em que aparecem na lista.
  useEffect(() => {
    if (!inputArquivos.current) return;
    const dt = new DataTransfer();
    for (const n of novos) dt.items.add(n.arquivo!);
    inputArquivos.current.files = dt.files;
  }, [novos]);

  const ordem = JSON.stringify(itens.map((i) => (i.arquivo ? `n:${novos.indexOf(i)}` : `e:${i.url}`)));

  function adicionar(files: FileList | null) {
    const lista = [...(files ?? [])].map((f) => ({ chave: `${f.name}-${f.size}-${Math.random()}`, url: URL.createObjectURL(f), arquivo: f }));
    setItens((l) => [...l, ...lista]);
  }
  const remover = (i: number) => setItens((l) => l.filter((_, j) => j !== i));
  function mover(de: number, para: number) {
    setItens((l) => {
      if (para < 0 || para >= l.length || de === para) return l;
      const c = [...l];
      const [x] = c.splice(de, 1);
      c.splice(para, 0, x!);
      return c;
    });
  }

  /** Props de arrastar e soltar para cada miniatura. */
  const arrastavel = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setArrastando(i);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (arrastando !== null && arrastando !== i) {
        mover(arrastando, i);
        setArrastando(i);
      }
    },
    onDragEnd: () => setArrastando(null),
    onDrop: (e: React.DragEvent) => e.preventDefault(),
  });

  return { itens, ordem, adicionar, remover, mover, arrastavel, arrastando, inputArquivos, campoArquivos };
}
