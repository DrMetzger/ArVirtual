"use client";

import { Download, ExternalLink, Film, Loader2, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, buttonClass, Card, Field, Select, Textarea } from "@/components/ui";
import type { VideoLista } from "@/lib/videos-tipos";

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function rede(url: string) {
  const h = url.toLowerCase();
  for (const [k, n] of [
    ["tiktok", "TikTok"],
    ["instagram", "Instagram"],
    ["threads.", "Threads"],
    ["facebook", "Facebook"],
    ["fb.watch", "Facebook"],
    ["youtu", "YouTube"],
    ["shopee", "Shopee"],
    ["kwai", "Kwai"],
    ["pinterest", "Pinterest"],
  ] as const)
    if (h.includes(k)) return n;
  return "Link";
}

/**
 * Conversor de vídeo sem recarregar a página: o formulário manda os links pela API, os vídeos novos entram na lista na
 * hora e só os que ainda estão convertendo são consultados (a cada 3 s) e atualizados no lugar.
 */
export function Conversor({ iniciais, produtos, compacto = false }: { iniciais: VideoLista[]; produtos: { id: number; nome: string }[]; compacto?: boolean }) {
  const [videos, setVideos] = useState(iniciais);
  const [links, setLinks] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tom: "green" | "red"; texto: string } | null>(null);
  const convertendo = videos.filter((v) => v.status === "baixando").map((v) => v.id);
  const chave = convertendo.join(",");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!chave) return;
    timer.current = setInterval(async () => {
      const r = await fetch(`/api/videos?ids=${chave}`).then((x) => (x.ok ? (x.json() as Promise<VideoLista[]>) : [])).catch(() => []);
      if (r.length) setVideos((vs) => vs.map((v) => r.find((n) => n.id === v.id) ?? v));
    }, 3000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [chave]);

  async function converter(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    const r = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links, produtoId: Number(produtoId) || null }) })
      .then(async (x) => ({ ok: x.ok, dados: await x.json() }))
      .catch(() => ({ ok: false, dados: { erro: "Sem conexão com o servidor." } }));
    setEnviando(false);
    if (!r.ok) return setMsg({ tom: "red", texto: (r.dados as { erro: string }).erro });
    const novos = r.dados as VideoLista[];
    setVideos((vs) => [...novos, ...vs]);
    setLinks("");
    setMsg({ tom: "green", texto: `${novos.length} vídeo(s) convertendo. ${compacto ? "Acompanhe abaixo ou em Conversor de vídeo." : "Eles ficam prontos aqui mesmo, sem recarregar."}` });
  }

  async function tentar(id: number) {
    setVideos((vs) => vs.map((v) => (v.id === id ? { ...v, status: "baixando", erro: "" } : v)));
    await fetch(`/api/videos/${id}`, { method: "POST" }).catch(() => undefined);
  }

  async function excluir(id: number) {
    if (!confirm("Excluir este vídeo da biblioteca?")) return;
    setVideos((vs) => vs.filter((v) => v.id !== id));
    await fetch(`/api/videos/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  const lista = compacto ? videos.slice(0, 4) : videos;

  return (
    <div className="grid gap-4">
      <form onSubmit={converter} className="grid gap-3">
        <Field label="Links dos vídeos" hint="Um por linha (até 30). TikTok, Instagram/Reels, YouTube/Shorts, Facebook, Threads, Shopee Vídeo, Kwai, Pinterest... Baixa na maior qualidade disponível.">
          <Textarea
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            rows={3}
            required
            placeholder={"https://www.tiktok.com/@.../video/...\nhttps://www.instagram.com/reel/...\nhttps://www.threads.com/@.../post/..."}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          {produtos.length ? (
            <Field label="Produto de afiliado (opcional)" className="min-w-0 flex-1 basis-60">
              <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                <option value="">Nenhum</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Button type="submit" variant="gold" disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : <Download />} Converter e baixar
          </Button>
        </div>
        {msg ? <Alert tone={msg.tom}>{msg.texto}</Alert> : null}
      </form>

      {!lista.length ? (
        compacto ? null : (
          <div className="grid justify-items-center gap-2 py-10 text-center text-sm text-muted">
            <Film className="size-8" /> Nenhum vídeo ainda. Cole um link acima.
          </div>
        )
      ) : (
        <div className={compacto ? "grid grid-cols-2 gap-3 md:grid-cols-4" : "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"}>
          {lista.map((v) => (
            <Card key={v.id} className="flex min-w-0 flex-col overflow-hidden">
              <div className="relative aspect-[9/16] bg-black">
                {v.arquivo ? (
                  <video src={`/api/afiliados/videos/${v.id}`} controls preload="metadata" playsInline className="size-full object-contain" />
                ) : (
                  <div className="grid size-full place-items-center p-3 text-center text-xs text-white/80">
                    {v.status === "baixando" ? (
                      <span className="grid justify-items-center gap-2">
                        <Loader2 className="size-6 animate-spin text-gold" /> Convertendo...
                      </span>
                    ) : (
                      <span className="text-red-300">{v.erro || "Não foi possível baixar."}</span>
                    )}
                  </div>
                )}
                <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                  <Badge className="bg-black/60 text-white">{rede(v.urlOrigem)}</Badge>
                  {v.status === "erro" ? <Badge tone="red">Erro</Badge> : null}
                </span>
              </div>
              <div className="grid flex-1 content-start gap-1 p-3">
                <p className="line-clamp-2 text-sm font-semibold">{v.titulo || "Vídeo"}</p>
                <p className="text-xs text-muted">
                  {v.arquivo ? `${dur(v.duracaoS)} · ${mb(v.tamanho)} · ` : ""}
                  {new Date(v.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </p>
                {v.produto && v.produtoId ? (
                  <Link href={`/afiliados/${v.produtoId}`} className="truncate text-xs text-gold hover:underline">
                    {v.produto}
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1 border-t border-border p-2">
                {v.arquivo ? (
                  <a href={`/api/afiliados/videos/${v.id}?baixar=1`} className={buttonClass("gold", "sm", "flex-1")}>
                    <Download /> Baixar MP4
                  </a>
                ) : v.status === "erro" ? (
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => tentar(v.id)}>
                    <RotateCw /> Tentar de novo
                  </Button>
                ) : (
                  <span className="flex-1" />
                )}
                {v.urlOrigem ? (
                  <a href={v.urlOrigem} target="_blank" rel="noreferrer" className={buttonClass("ghost", "icon")} title="Abrir o original">
                    <ExternalLink />
                  </a>
                ) : null}
                <Button type="button" variant="ghost" size="icon" className="hover:text-red" onClick={() => excluir(v.id)} title="Excluir">
                  <Trash2 />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {compacto && videos.length > 4 ? (
        <Link href="/videos" className="text-sm font-semibold text-gold hover:underline">
          Ver todos os {videos.length} vídeos →
        </Link>
      ) : null}
    </div>
  );
}
