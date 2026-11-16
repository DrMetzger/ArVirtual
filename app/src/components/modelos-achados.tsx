"use client";

import { CheckCircle2, Download, ExternalLink, Heart, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { andamentoCadastro, cadastrarTudo } from "@/app/(app)/produtos/modelo3d/actions";
import { FotoAmpliavel } from "@/components/foto-ampliavel";
import { Alert, Badge, Button, buttonClass } from "@/components/ui";
import type { ModeloAchado } from "@/db/schema";
import type { EstadoCadastro } from "@/lib/cadastro-modelos";
import { cn } from "@/lib/utils";

const num = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(n));

/** Modelo achado no MakerWorld/Printables: foto, licença e botões de cadastrar e ver no site. */
export function CartaoModelo({ m }: { m: ModeloAchado }) {
  return (
    <div className={cn("grid content-start gap-2 rounded-xl border p-2", m.comercial === false ? "border-red/40" : "border-border")}>
      {m.imagem ? (
        <FotoAmpliavel src={m.imagem} alt={m.titulo} className="aspect-square w-full rounded-lg bg-surface-2 object-cover" />
      ) : (
        <div className="aspect-square rounded-lg bg-surface-2" />
      )}
      <p className="line-clamp-2 text-sm font-semibold">{m.titulo}</p>
      <p className="text-[11px] text-muted">
        {m.fonte === "makerworld" ? "MakerWorld" : "Printables"}
        {m.autor ? ` · ${m.autor}` : ""}
      </p>
      <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-0.5">
          <Download className="size-3" /> {num(m.downloads)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Heart className="size-3" /> {num(m.curtidas)}
        </span>
      </p>
      <Badge tone={m.comercial === true ? "green" : m.comercial === false ? "red" : "neutral"} className="justify-self-start">
        {m.comercial === true ? "Pode vender" : m.comercial === false ? "Não pode vender" : "Licença: conferir"}
      </Badge>
      <div className="flex flex-wrap gap-1.5">
        <Link href={`/produtos/modelo3d?link=${encodeURIComponent(m.link)}`} className={buttonClass(m.comercial === false ? "outline" : "gold", "sm")}>
          <Sparkles /> Cadastrar
        </Link>
        <a href={m.link} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
          <ExternalLink /> Ver
        </a>
      </div>
    </div>
  );
}

/** Cadastra de uma vez todos os modelos da lista que a licença deixa vender (os já cadastrados são pulados). */
export function BotaoCadastrarTudo({ modelos, rotulo = "Cadastrar tudo que pode vender", aoIniciar }: { modelos: ModeloAchado[]; rotulo?: string; aoIniciar?: () => void }) {
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [rodando, iniciar] = useTransition();
  const vendaveis = modelos.filter((m) => m.comercial === true).length;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="gold"
        disabled={rodando || !vendaveis}
        onClick={() =>
          iniciar(async () => {
            const r = await cadastrarTudo(modelos.map((m) => ({ link: m.link, titulo: m.titulo, comercial: m.comercial })));
            setMsg(r);
            if (r.ok) aoIniciar?.();
          })
        }
      >
        <Sparkles /> {rotulo} ({vendaveis})
      </Button>
      {msg ? <span className={msg.erro ? "text-xs text-red" : "text-xs text-green"}>{msg.erro ?? msg.ok}</span> : null}
    </span>
  );
}

/** Progresso do "Cadastrar tudo" (pergunta ao servidor a cada 3 s; a página não recarrega). */
export function ProgressoCadastro({ inicial, vigiar = 0 }: { inicial: EstadoCadastro | null; vigiar?: number }) {
  const [est, setEst] = useState(inicial);
  useEffect(() => {
    let parar = false;
    const ler = async () => {
      const r = await andamentoCadastro().catch(() => undefined);
      if (!parar && r !== undefined) setEst(r);
    };
    if (vigiar) void ler();
    const t = setInterval(ler, 3000);
    return () => {
      parar = true;
      clearInterval(t);
    };
    // `vigiar` muda quando um cadastro novo começa: reinicia a consulta.
  }, [vigiar]);
  if (!est || (!est.rodando && !est.criados.length && !est.erros.length && !est.pulados.length)) return null;
  const pct = est.total ? Math.round((est.feitos / est.total) * 100) : 0;
  return (
    <Alert tone={est.rodando ? "gold" : est.erros.length ? "red" : "green"}>
      <div className="grid gap-2">
        <p className="inline-flex flex-wrap items-center gap-2 font-semibold">
          {est.rodando ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {est.rodando ? `Cadastrando ${est.feitos} de ${est.total} (${pct}%)` : `Pronto: ${est.criados.length} produto(s) cadastrado(s)`}
          {est.pulados.length ? ` · ${est.pulados.length} pulado(s)` : ""}
        </p>
        {est.rodando ? (
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {est.rodando && est.atual ? <p className="text-xs">Agora: {est.atual}</p> : null}
        {est.criados.length ? (
          <p className="text-xs">
            Cadastrados:{" "}
            {est.criados.map((c, i) => (
              <span key={c.id}>
                {i ? " · " : ""}
                <Link href={`/produtos/${c.id}`} className="underline">
                  {c.nome}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {est.pulados.length ? <p className="text-xs">Pulados: {est.pulados.join(" · ")}</p> : null}
        {est.erros.length ? <p className="text-xs">Não deu: {est.erros.join(" | ")}</p> : null}
      </div>
    </Alert>
  );
}
