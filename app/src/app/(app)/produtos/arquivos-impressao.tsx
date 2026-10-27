"use client";

import { Box, Download, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, Button, Card, CardHeader, Input } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

export type ArquivoImpressao = {
  id: number;
  nome: string;
  tamanho: number;
  observacao: string;
  enviadoPor: string;
  criadoEm: string | Date;
};

const EXTENSOES = ["3mf", "stl", "obj", "step", "stp", "gcode", "amf", "ply", "zip"];
const MAX = 150 * 1024 * 1024;

function tamanho(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Envia com XMLHttpRequest para mostrar o progresso (fetch não informa o andamento do envio). */
function enviar(produtoId: string, arquivo: File, progresso: (p: number) => void) {
  return new Promise<ArquivoImpressao>((ok, falha) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/produtos/${produtoId}/arquivos`);
    xhr.setRequestHeader("x-nome", encodeURIComponent(arquivo.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && progresso(e.loaded / e.total);
    xhr.onload = () => {
      let r: { arquivo?: ArquivoImpressao; erro?: string } = {};
      try {
        r = JSON.parse(xhr.responseText);
      } catch {
        // resposta não-JSON (ex.: proxy recusou o tamanho)
      }
      if (xhr.status === 200 && r.arquivo) ok(r.arquivo);
      else falha(new Error(r.erro || `${arquivo.name}: falha no envio (${xhr.status}).`));
    };
    xhr.onerror = () => falha(new Error(`${arquivo.name}: conexão interrompida.`));
    xhr.send(arquivo);
  });
}

/**
 * Arquivos de impressão do produto (3MF do Bambu Studio, STL, G-code...): quem vai imprimir baixa daqui.
 * Fica fora do formulário do produto: envia e apaga na hora, sem precisar salvar.
 */
export function ArquivosImpressao({ produtoId, iniciais }: { produtoId: string; iniciais: ArquivoImpressao[] }) {
  const [arquivos, setArquivos] = useState(iniciais);
  const [enviando, setEnviando] = useState<{ nome: string; progresso: number }[]>([]);
  const [erros, setErros] = useState<string[]>([]);
  const [sobre, setSobre] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function adicionar(lista: FileList | File[]) {
    const novos = [...lista];
    setErros([]);
    const recusados = novos.flatMap((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXTENSOES.includes(ext)) return [`${f.name}: formato não aceito.`];
      if (f.size > MAX) return [`${f.name}: passa de 150 MB.`];
      return [];
    });
    const validos = novos.filter((f) => EXTENSOES.includes(f.name.split(".").pop()?.toLowerCase() ?? "") && f.size <= MAX);
    setErros(recusados);
    setEnviando(validos.map((f) => ({ nome: f.name, progresso: 0 })));
    for (const [i, f] of validos.entries()) {
      try {
        const salvo = await enviar(produtoId, f, (p) => setEnviando((e) => e.map((x, j) => (j === i ? { ...x, progresso: p } : x))));
        setArquivos((a) => [salvo, ...a]);
      } catch (e) {
        setErros((x) => [...x, (e as Error).message]);
      }
      setEnviando((e) => e.map((x, j) => (j === i ? { ...x, progresso: 1 } : x)));
    }
    setEnviando([]);
  }

  async function apagar(a: ArquivoImpressao) {
    if (!confirm(`Apagar ${a.nome}?`)) return;
    const r = await fetch(`/api/produtos/${produtoId}/arquivos/${a.id}`, { method: "DELETE" });
    if (r.ok) setArquivos((l) => l.filter((x) => x.id !== a.id));
    else setErros([`Não foi possível apagar ${a.nome}.`]);
  }

  async function observar(a: ArquivoImpressao, observacao: string) {
    if (observacao === a.observacao) return;
    setArquivos((l) => l.map((x) => (x.id === a.id ? { ...x, observacao } : x)));
    await fetch(`/api/produtos/${produtoId}/arquivos/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacao }),
    });
  }

  return (
    <Card>
      <CardHeader
        title="Arquivos de impressão"
        description="3MF do Bambu Studio, STL, OBJ, STEP ou G-code (até 150 MB cada). Ficam guardados aqui para quem for imprimir baixar."
        action={<Box className="size-5 text-gold" />}
      />
      <div className="grid gap-4 p-5">
        {erros.map((e) => (
          <Alert key={e}>{e}</Alert>
        ))}
        <input
          ref={input}
          type="file"
          multiple
          accept={EXTENSOES.map((e) => `.${e}`).join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void adicionar(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setSobre(true);
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            if (e.dataTransfer.files.length) void adicionar(e.dataTransfer.files);
          }}
          disabled={enviando.length > 0}
          className={cn(
            "grid place-items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm text-muted transition hover:border-gold hover:text-gold",
            sobre ? "border-gold bg-gold/10 text-gold" : "border-border",
          )}
        >
          <Upload className="size-6" />
          <span className="font-semibold">Arraste os arquivos aqui ou clique para escolher</span>
          <span className="text-xs">.3mf · .stl · .obj · .step · .gcode</span>
        </button>

        {enviando.map((e) => (
          <div key={e.nome} className="grid gap-1 text-sm">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-gold" />
              <span className="min-w-0 flex-1 truncate">{e.nome}</span>
              <span className="text-xs text-muted">{Math.round(e.progresso * 100)}%</span>
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-full bg-gold transition-all" style={{ width: `${e.progresso * 100}%` }} />
            </div>
          </div>
        ))}

        {arquivos.length ? (
          <div className="divide-y divide-border rounded-xl border border-border">
            {arquivos.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-gold/15 text-[11px] font-bold uppercase text-gold">
                  {a.nome.split(".").pop()}
                </span>
                <div className="min-w-[180px] flex-1">
                  <a href={`/api/produtos/${produtoId}/arquivos/${a.id}`} download={a.nome} className="block truncate text-sm font-semibold hover:text-gold" title={`Baixar ${a.nome}`}>
                    {a.nome}
                  </a>
                  <p className="text-xs text-muted">
                    {tamanho(a.tamanho)} · {formatDate(new Date(a.criadoEm))}
                    {a.enviadoPor ? ` · ${a.enviadoPor}` : ""}
                  </p>
                </div>
                <Input
                  defaultValue={a.observacao}
                  onBlur={(e) => observar(a, e.target.value.trim())}
                  placeholder="Observação (ex.: placa 1, corpo vermelho)"
                  className="h-9 min-w-[200px] flex-1 text-sm"
                  aria-label={`Observação de ${a.nome}`}
                />
                <div className="flex shrink-0 gap-1">
                  <a href={`/api/produtos/${produtoId}/arquivos/${a.id}`} download={a.nome} className="grid size-9 place-items-center rounded-lg text-muted hover:text-gold" title="Baixar">
                    <Download className="size-4" />
                  </a>
                  <Button type="button" variant="ghost" size="icon" onClick={() => apagar(a)} className="hover:text-red" title="Apagar">
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : !enviando.length ? (
          <p className="text-sm text-muted">Nenhum arquivo ainda.</p>
        ) : null}
      </div>
    </Card>
  );
}
