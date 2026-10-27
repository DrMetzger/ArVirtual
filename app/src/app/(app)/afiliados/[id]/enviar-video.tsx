"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui";

/** Envia vídeos do computador (com progresso) para a biblioteca do produto. */
export function EnviarVideo({ produtoId }: { produtoId: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<{ nome: string; p: number } | null>(null);
  const [erro, setErro] = useState("");

  async function enviar(arquivos: File[]) {
    setErro("");
    for (const f of arquivos) {
      setProgresso({ nome: f.name, p: 0 });
      const r = await new Promise<string>((ok) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/afiliados/videos?produto=${produtoId}`);
        xhr.setRequestHeader("x-nome", encodeURIComponent(f.name));
        xhr.upload.onprogress = (e) => e.lengthComputable && setProgresso({ nome: f.name, p: e.loaded / e.total });
        xhr.onload = () => {
          try {
            const j = JSON.parse(xhr.responseText) as { erro?: string };
            ok(xhr.status === 200 ? "" : j.erro || `Falha (${xhr.status})`);
          } catch {
            ok(`Falha no envio (${xhr.status}).`);
          }
        };
        xhr.onerror = () => ok("Conexão interrompida.");
        xhr.send(f);
      });
      if (r) setErro(`${f.name}: ${r}`);
    }
    setProgresso(null);
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      {erro ? <Alert>{erro}</Alert> : null}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v"
        multiple
        className="hidden"
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = "";
          if (fs.length) void enviar(fs);
        }}
      />
      <button
        type="button"
        disabled={Boolean(progresso)}
        onClick={() => input.current?.click()}
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-4 text-sm font-semibold text-muted hover:border-gold hover:text-gold"
      >
        {progresso ? (
          <>
            <Loader2 className="size-4 animate-spin" /> {progresso.nome} · {Math.round(progresso.p * 100)}%
          </>
        ) : (
          <>
            <Upload className="size-4" /> Enviar vídeo do computador (MP4, MOV)
          </>
        )}
      </button>
    </div>
  );
}

/** Atualiza a página a cada poucos segundos enquanto algum vídeo está sendo baixado. */
export function AtualizarEnquanto({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}
