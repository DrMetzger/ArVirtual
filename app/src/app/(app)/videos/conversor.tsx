"use client";

import { Check, Download, ExternalLink, Film, Loader2, RotateCw, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, buttonClass, Card, Field, Select, Textarea } from "@/components/ui";
import type { PreviaVideo, VideoLista } from "@/lib/videos-tipos";

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
  const [previas, setPrevias] = useState<(PreviaVideo & { marcado: boolean })[] | null>(null);
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

  /** 1º passo: acha o vídeo de cada link e mostra para confirmar. */
  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setMsg(null);
    setPrevias(null);
    const r = await fetch("/api/videos/previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }) })
      .then(async (x) => ({ ok: x.ok, dados: await x.json() }))
      .catch(() => ({ ok: false, dados: { erro: "Sem conexão com o servidor." } }));
    setEnviando(false);
    if (!r.ok) return setMsg({ tom: "red", texto: (r.dados as { erro: string }).erro });
    setPrevias((r.dados as PreviaVideo[]).map((p) => ({ ...p, marcado: !p.erro })));
  }

  /** 2º passo: baixa os confirmados (pelo endereço real que a busca achou). */
  async function baixarConfirmados() {
    const escolhidos = (previas ?? []).filter((p) => p.marcado && !p.erro);
    if (!escolhidos.length) return;
    setEnviando(true);
    const r = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: escolhidos.map((p) => p.url).join("\n"), produtoId: Number(produtoId) || null }),
    })
      .then(async (x) => ({ ok: x.ok, dados: await x.json() }))
      .catch(() => ({ ok: false, dados: { erro: "Sem conexão com o servidor." } }));
    setEnviando(false);
    if (!r.ok) return setMsg({ tom: "red", texto: (r.dados as { erro: string }).erro });
    const novos = r.dados as VideoLista[];
    setVideos((vs) => [...novos, ...vs]);
    setLinks("");
    setPrevias(null);
    setMsg({ tom: "green", texto: `${novos.length} vídeo(s) baixando na maior qualidade. ${compacto ? "Acompanhe abaixo ou em Conversor de vídeo." : "Ficam prontos aqui mesmo, sem recarregar."}` });
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
      <form onSubmit={buscar} className="grid gap-3">
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
            {enviando && !previas ? <Loader2 className="animate-spin" /> : <Search />} {enviando && !previas ? "Procurando o vídeo..." : "Buscar vídeo"}
          </Button>
        </div>
        {msg ? <Alert tone={msg.tom}>{msg.texto}</Alert> : null}
      </form>

      {previas ? (
        <div className="grid gap-3 rounded-2xl border border-gold/50 bg-surface-2/40 p-3 sm:p-4">
          <p className="font-display text-base font-bold">{previas.length > 1 ? "Achei estes vídeos. Baixar os marcados?" : "Achei este vídeo. É este?"}</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {previas.map((p, i) => (
              <label key={p.link} className={`grid min-w-0 content-start gap-2 rounded-xl border bg-surface p-2 ${p.erro ? "border-red/40" : p.marcado ? "border-gold" : "border-border"}`}>
                <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-black">
                  {p.video ? (
                    <video src={p.video} poster={p.capa || undefined} controls playsInline preload="metadata" className="size-full object-contain" />
                  ) : p.capa ? (
                    <img src={p.capa} alt="" className="size-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid size-full place-items-center p-2 text-center text-xs text-red-300">{p.erro || "Sem prévia"}</div>
                  )}
                  <Badge className="absolute left-2 top-2 bg-black/60 text-white">{p.rede}</Badge>
                  {p.duracaoS ? <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 text-xs text-white">{dur(p.duracaoS)}</span> : null}
                </div>
                <p className="line-clamp-2 text-xs font-semibold">{p.titulo || p.link}</p>
                {p.erro ? (
                  <p className="text-xs text-red">{p.erro}</p>
                ) : (
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={p.marcado}
                      onChange={(e) => setPrevias((ps) => ps!.map((x, j) => (j === i ? { ...x, marcado: e.target.checked } : x)))}
                      className="size-4 accent-[var(--gold)]"
                    />
                    Baixar este
                  </span>
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="gold" onClick={baixarConfirmados} disabled={enviando || !previas.some((p) => p.marcado && !p.erro)}>
              {enviando ? <Loader2 className="animate-spin" /> : <Check />} Sim, baixar {previas.filter((p) => p.marcado && !p.erro).length > 1 ? `os ${previas.filter((p) => p.marcado && !p.erro).length}` : ""}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPrevias(null)} disabled={enviando}>
              <X /> Não é este
            </Button>
          </div>
        </div>
      ) : null}

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
