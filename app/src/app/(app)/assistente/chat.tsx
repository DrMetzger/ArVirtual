"use client";

import {
  Bot,
  Box,
  Brain,
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  PanelLeft,
  Paperclip,
  Printer,
  RefreshCw,
  SendHorizonal,
  Sparkles,
  Square,
  Upload,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Select } from "@/components/ui";
import { urlAnexo, type AnexoTela, type ConversaTela, type MensagemTela } from "@/lib/assistente/tipos";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { Organizador } from "./organizador";

const ACEITOS =
  "image/*,application/pdf,.stl,.3mf,.gcode,.txt,.csv,.tsv,.md,.json,.xml,.html,.log,.ini,.cfg,.yaml,.yml,.ino,.c,.cpp,.h,.py,.js,.ts,.sql,.prw,.tlpp";

const SUGESTOES: { texto: string; imagem?: boolean }[] = [
  { texto: "Minha peça em PETG está com stringing (fiapos). Que ajustes faço no Bambu Studio para a minha impressora?" },
  { texto: "Calcule o preço de uma peça de 45 g com 2h10 de impressão para Mercado Livre, Shopee e Magalu, mostrando o lucro." },
  { texto: "Me dê 10 ideias de produtos impressos em 3D que vendem bem na Shopee, com preço sugerido e tempo de impressão." },
  { texto: "Quais filamentos estão acabando e o que eu deveria comprar para atender as vendas do mês?" },
  { texto: "Foto de produto de um vaso decorativo impresso em 3D em PLA Silk dourado, fundo branco, luz de estúdio", imagem: true },
  { texto: "Escreva um anúncio completo (título, descrição e palavras-chave) para um suporte de headset impresso em 3D." },
];

type Pendente = { id: string; file: File; url?: string };
type Msg = MensagemTela & { local?: boolean; previas?: { nome: string; url?: string; tipo: string }[]; memorias?: string[]; erro?: boolean };

const semMarcas = (t: string) => t.replace(/\[\[lembrar:[^\]]*\]\]/g, "").replace(/\[\[[^\]]*$/, "").trimEnd();

function iconeArquivo(nome: string, tipo: string) {
  if (/\.(stl|3mf|gcode)$/i.test(nome)) return <Box className="size-4 text-gold" />;
  if (tipo.startsWith("image/")) return <ImagePlus className="size-4 text-gold" />;
  return <FileText className="size-4 text-gold" />;
}

export function Chat({
  conversas,
  conversaId,
  mensagensIniciais,
  totalMemorias,
  impressora,
}: {
  conversas: ConversaTela[];
  conversaId: string | null;
  mensagensIniciais: MensagemTela[];
  totalMemorias: number;
  impressora: string;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState<{ id: string | null; msgs: Msg[] }>({ id: conversaId, msgs: mensagensIniciais });
  const [idProp, setIdProp] = useState(conversaId);
  const [lista, setLista] = useState(conversas);
  const [listaProp, setListaProp] = useState(conversas);
  // Navegou para outra conversa (link do organizador): troca as mensagens.
  if (conversaId !== idProp) {
    setIdProp(conversaId);
    if (conversaId !== atual.id) setAtual({ id: conversaId, msgs: mensagensIniciais });
  }
  if (conversas !== listaProp) {
    setListaProp(conversas);
    setLista(conversas);
  }

  const [input, setInput] = useState("");
  const [arquivos, setArquivos] = useState<Pendente[]>([]);
  const [modoImagem, setModoImagem] = useState(false);
  const [proporcao, setProporcao] = useState("1:1");
  const [pesquisa, setPesquisa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [status, setStatus] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [menuMobile, setMenuMobile] = useState(false);
  const [aviso, setAviso] = useState("");
  const abortar = useRef<AbortController | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const contadorArraste = useRef(0);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [atual.msgs, status]);

  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [input]);

  function adicionarArquivos(files: FileList | File[]) {
    const novos = [...files].slice(0, 10 - arquivos.length).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random()}`,
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    if (files.length > novos.length) setAviso("Até 10 arquivos por mensagem.");
    setArquivos((a) => [...a, ...novos]);
  }

  function novaConversa() {
    abortar.current?.abort();
    setAtual({ id: null, msgs: [] });
    setMenuMobile(false);
    router.push("/assistente");
  }

  function alterarConversa(id: string, mudanca: Partial<ConversaTela> | null) {
    setLista((l) => (mudanca ? l.map((c) => (c.id === id ? { ...c, ...mudanca } : c)) : l.filter((c) => c.id !== id)));
    if (!mudanca && id === atual.id) novaConversa();
  }

  async function enviar(opcoes: { texto?: string; regenerar?: boolean; imagem?: boolean } = {}) {
    const texto = (opcoes.texto ?? input).trim();
    const imagem = opcoes.imagem ?? modoImagem;
    if (enviando || (!opcoes.regenerar && !texto && !arquivos.length)) return;
    setAviso("");
    const form = new FormData();
    if (atual.id) form.set("conversa", atual.id);
    form.set("modo", imagem ? "imagem" : "texto");
    if (imagem) form.set("proporcao", proporcao);
    if (pesquisa) form.set("pesquisa", "1");

    let base = atual.msgs;
    if (opcoes.regenerar) {
      form.set("regenerar", "1");
      if (base.at(-1)?.papel === "model") base = base.slice(0, -1);
    } else {
      form.set("texto", texto);
      for (const a of arquivos) form.append("arquivos", a.file);
      const temp: Msg = {
        id: -Date.now(),
        papel: "user",
        texto,
        anexos: [],
        fontes: [],
        modelo: "",
        criadoEm: new Date().toISOString(),
        local: true,
        previas: arquivos.map((a) => ({ nome: a.file.name, url: a.url, tipo: a.file.type })),
      };
      base = [...base.filter((m) => !m.erro), temp];
      setInput("");
      setArquivos([]);
    }
    const resposta: Msg = { id: -Date.now() - 1, papel: "model", texto: "", anexos: [], fontes: [], modelo: "", criadoEm: new Date().toISOString(), local: true };
    let msgs: Msg[] = [...base, resposta];
    let id = atual.id;
    const mostrar = () => setAtual({ id, msgs: [...msgs] });
    mostrar();
    setEnviando(true);
    setStatus(imagem ? "Criando imagem..." : pesquisa ? "Pesquisando na web..." : "Pensando...");

    const ctrl = new AbortController();
    abortar.current = ctrl;
    try {
      const res = await fetch("/api/assistente", { method: "POST", body: form, signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { erro?: string };
        throw new Error(data.erro ?? `Erro ${res.status}`);
      }
      const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += value;
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        for (const linha of linhas) {
          if (!linha.trim()) continue;
          const ev = JSON.parse(linha) as Record<string, unknown> & { t: string };
          const ultima = msgs.length - 1;
          if (ev.t === "conversa") {
            if (ev.nova) {
              id = ev.id as string;
              window.history.replaceState(null, "", `/assistente/${id}`);
              setLista((l) => [{ id: id!, titulo: ev.titulo as string, pasta: "", fixada: false, atualizadoEm: new Date().toISOString() }, ...l]);
            }
          } else if (ev.t === "usuario") {
            const m = ev.mensagem as MensagemTela;
            msgs = msgs.map((x, i) => (i === ultima - 1 && x.papel === "user" ? { ...m, previas: x.previas } : x));
          } else if (ev.t === "status") {
            setStatus(ev.texto as string);
          } else if (ev.t === "delta") {
            setStatus("");
            msgs[ultima] = { ...msgs[ultima]!, texto: msgs[ultima]!.texto + (ev.texto as string) };
          } else if (ev.t === "reiniciar") {
            msgs[ultima] = { ...msgs[ultima]!, texto: "" };
            setStatus("Trocando de modelo...");
          } else if (ev.t === "fim") {
            msgs[ultima] = { ...(ev.mensagem as MensagemTela), memorias: ev.memorias as string[] };
            setLista((l) => {
              const c = l.find((x) => x.id === id);
              return c ? [{ ...c, atualizadoEm: new Date().toISOString() }, ...l.filter((x) => x.id !== id)] : l;
            });
          } else if (ev.t === "titulo") {
            setLista((l) => l.map((c) => (c.id === id ? { ...c, titulo: ev.titulo as string } : c)));
          } else if (ev.t === "erro") {
            msgs[ultima] = { ...msgs[ultima]!, texto: ev.erro as string, erro: true };
          }
          mostrar();
        }
      }
    } catch (e) {
      const ultima = msgs.length - 1;
      if ((e as Error).name === "AbortError") {
        msgs[ultima] = { ...msgs[ultima]!, texto: `${msgs[ultima]!.texto}\n\n_(interrompido)_`.trim(), erro: !msgs[ultima]!.texto };
      } else {
        msgs[ultima] = { ...msgs[ultima]!, texto: (e as Error).message || "Não foi possível falar com o assistente agora.", erro: true };
      }
      mostrar();
    } finally {
      setEnviando(false);
      setStatus("");
      abortar.current = null;
    }
  }

  const msgs = atual.msgs;
  const ultimaModelo = [...msgs].reverse().find((m) => m.papel === "model");

  return (
    <div className="-my-2 flex h-[calc(100dvh-7.5rem)] min-h-[32rem] gap-4 sm:h-[calc(100dvh-5.5rem)] lg:h-[calc(100dvh-4rem)]">
      {/* Organizador */}
      <aside
        className={cn(
          "w-72 shrink-0 rounded-2xl border border-border bg-surface p-3",
          menuMobile ? "fixed inset-y-3 left-3 z-40 shadow-card" : "hidden lg:block",
        )}
      >
        <Organizador
          conversas={lista}
          atual={atual.id}
          onNova={novaConversa}
          onAlterar={alterarConversa}
          onAbrir={() => setMenuMobile(false)}
          totalMemorias={totalMemorias}
        />
      </aside>
      {menuMobile ? <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuMobile(false)} /> : null}

      {/* Conversa */}
      <section
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          contadorArraste.current++;
          setArrastando(true);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDragLeave={() => {
          contadorArraste.current = Math.max(0, contadorArraste.current - 1);
          if (!contadorArraste.current) setArrastando(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          contadorArraste.current = 0;
          setArrastando(false);
          if (e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files);
        }}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuMobile(true)} aria-label="Conversas">
            <PanelLeft />
          </Button>
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0f3b66] to-[#06112a] text-[#e6c158]">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold">{lista.find((c) => c.id === atual.id)?.titulo ?? "Assistente IA"}</p>
            <a href="/configuracoes?aba=impressora" className="flex items-center gap-1.5 truncate text-xs text-muted hover:text-gold" title="Configurar impressora">
              <Printer className="size-3.5 shrink-0" /> {impressora}
            </a>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {msgs.length === 0 ? (
            <div className="mx-auto grid max-w-3xl gap-6 py-6 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-[#0f3b66] to-[#06112a] text-[#e6c158] shadow-card">
                <Sparkles className="size-8" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold">Como posso ajudar hoje?</p>
                <p className="mt-1 text-sm text-muted">
                  Especialista em impressão 3D e vendas em marketplace. Conhece sua impressora, seus produtos, filamentos e vendas. Arraste fotos, PDFs, STL, 3MF ou
                  G-code para cá.
                </p>
              </div>
              <div className="grid gap-2 text-left sm:grid-cols-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s.texto}
                    type="button"
                    onClick={() => {
                      if (s.imagem) setModoImagem(true);
                      void enviar({ texto: s.texto, imagem: s.imagem });
                    }}
                    className="flex items-start gap-2 rounded-xl border border-border p-3 text-left text-sm text-muted transition hover:border-gold hover:text-foreground"
                  >
                    {s.imagem ? <ImagePlus className="mt-0.5 size-4 shrink-0 text-gold" /> : <Sparkles className="mt-0.5 size-4 shrink-0 text-gold" />}
                    {s.texto}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-3xl gap-6">
              {msgs.map((m, i) => (
                <Mensagem
                  key={m.id}
                  m={m}
                  pedido={m.papel === "model" ? (msgs[i - 1]?.texto ?? "") : ""}
                  carregando={enviando && i === msgs.length - 1 && m.papel === "model"}
                  status={status}
                  podeRegenerar={!enviando && m === ultimaModelo && i === msgs.length - 1 && !msgs[i - 1]?.local}
                  onRegenerar={() => void enviar({ regenerar: true, imagem: m.anexos.length > 0 })}
                />
              ))}
              <div ref={fim} />
            </div>
          )}
        </div>

        {/* Caixa de mensagem */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="border-t border-border p-3"
        >
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface-2 p-2 focus-within:border-gold/70">
            {arquivos.length ? (
              <div className="flex flex-wrap gap-2 p-1 pb-2">
                {arquivos.map((a) => (
                  <div key={a.id} className="group relative flex items-center gap-2 rounded-xl border border-border bg-surface py-1.5 pr-7 pl-1.5 text-xs">
                    {a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt="" className="size-9 rounded-lg object-cover" />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-lg bg-surface-2">{iconeArquivo(a.file.name, a.file.type)}</span>
                    )}
                    <span className="max-w-40 truncate">
                      {a.file.name}
                      <span className="block text-muted">{(a.file.size / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setArquivos((l) => l.filter((x) => x.id !== a.id))}
                      className="absolute top-1 right-1 rounded-md p-0.5 text-muted hover:bg-surface-2 hover:text-foreground"
                      aria-label={`Remover ${a.file.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={campo}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  adicionarArquivos(e.clipboardData.files);
                }
              }}
              rows={1}
              placeholder={modoImagem ? "Descreva a imagem (ou anexe uma foto para editar)" : "Pergunte ao assistente (Enter envia, Shift+Enter quebra linha)"}
              className="block max-h-56 w-full resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted/70"
            />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <input
                ref={seletor}
                type="file"
                multiple
                accept={ACEITOS}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) adicionarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="ghost" size="icon" title="Anexar arquivos (fotos, PDF, STL, 3MF, G-code, planilhas)" onClick={() => seletor.current?.click()}>
                <Paperclip />
              </Button>
              <button
                type="button"
                onClick={() => setModoImagem((v) => !v)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
                  modoImagem ? "border-gold bg-gold/15 text-gold" : "border-border text-muted hover:text-foreground",
                )}
              >
                <ImagePlus className="size-3.5" /> Criar imagem
              </button>
              {modoImagem ? (
                <Select value={proporcao} onChange={(e) => setProporcao(e.target.value)} className="h-8 w-auto rounded-full py-0 text-xs" aria-label="Proporção">
                  <option value="1:1">Quadrada 1:1</option>
                  <option value="4:3">Paisagem 4:3</option>
                  <option value="16:9">Banner 16:9</option>
                  <option value="3:4">Retrato 3:4</option>
                  <option value="9:16">Stories 9:16</option>
                </Select>
              ) : (
                <button
                  type="button"
                  onClick={() => setPesquisa((v) => !v)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
                    pesquisa ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted hover:text-foreground",
                  )}
                  title="Pesquisar no Google antes de responder (preços, novidades, tutoriais)"
                >
                  <Globe className="size-3.5" /> Pesquisa na web
                </button>
              )}
              <span className="ml-auto text-[11px] text-muted">{aviso}</span>
              {enviando ? (
                <Button type="button" variant="outline" size="icon" title="Parar" onClick={() => abortar.current?.abort()}>
                  <Square className="fill-current" />
                </Button>
              ) : (
                <Button type="submit" variant="gold" size="icon" disabled={!input.trim() && !arquivos.length} aria-label="Enviar">
                  <SendHorizonal />
                </Button>
              )}
            </div>
          </div>
          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted">
            A IA pode errar. Confira valores fiscais com o contador e teste perfis de impressão antes de produzir em série.
          </p>
        </form>

        {arrastando ? (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-gold bg-background/85 backdrop-blur-sm">
            <div className="grid justify-items-center gap-2 text-center">
              <Upload className="size-10 text-gold" />
              <p className="font-display text-lg font-bold">Solte os arquivos aqui</p>
              <p className="text-sm text-muted">Fotos, PDF, STL, 3MF, G-code, planilhas e XML</p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Anexos({ anexos, previas, grande }: { anexos: AnexoTela[]; previas?: Msg["previas"]; grande?: boolean }) {
  const itens = anexos.length
    ? anexos.map((a) => ({ nome: a.nome, tipo: a.tipo, url: urlAnexo(a), baixar: urlAnexo(a, true) }))
    : (previas ?? []).map((p) => ({ nome: p.nome, tipo: p.tipo, url: p.url, baixar: undefined }));
  if (!itens.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", grande ? "" : "justify-end")}>
      {itens.map((a, i) =>
        a.tipo.startsWith("image/") && a.url ? (
          <div key={i} className="group relative">
            <a href={a.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.nome}
                className={cn("rounded-xl border border-border bg-white object-cover", grande ? "max-h-[28rem] w-full max-w-md object-contain" : "size-28")}
              />
            </a>
            {a.baixar ? (
              <a
                href={a.baixar}
                className="absolute top-2 right-2 grid size-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                title="Baixar"
              >
                <Download className="size-4" />
              </a>
            ) : null}
          </div>
        ) : (
          <a
            key={i}
            href={a.baixar ?? "#"}
            className="flex items-center gap-2 self-start rounded-xl border border-border bg-surface px-3 py-2 text-xs hover:border-gold"
            title="Baixar"
          >
            {iconeArquivo(a.nome, a.tipo)}
            <span className="max-w-48 truncate">{a.nome}</span>
          </a>
        ),
      )}
    </div>
  );
}

function Mensagem({
  m,
  pedido,
  carregando,
  status,
  podeRegenerar,
  onRegenerar,
}: {
  m: Msg;
  pedido: string;
  carregando: boolean;
  status: string;
  podeRegenerar: boolean;
  onRegenerar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  if (m.papel === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="grid max-w-[85%] justify-items-end gap-2">
          <Anexos anexos={m.anexos} previas={m.previas} />
          {m.texto ? <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm whitespace-pre-wrap text-primary-fg">{m.texto}</div> : null}
        </div>
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-fg">
          <User className="size-4" />
        </div>
      </div>
    );
  }
  const texto = semMarcas(m.texto);
  return (
    <div className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0a1a33] text-[#e6c158]">
        {carregando ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
      </div>
      <div className="grid min-w-0 flex-1 gap-3">
        {carregando && !texto ? <p className="pt-1.5 text-sm text-muted">{status || "Pensando..."}</p> : null}
        {texto ? (
          m.erro ? (
            <div className="grid gap-3 rounded-xl border border-red/40 bg-red/10 px-4 py-3 text-sm text-red">
              {texto}
              {/sem cota de imagem/i.test(texto) && pedido ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(pedido);
                      window.open("https://gemini.google.com/app", "_blank", "noopener");
                    }}
                  >
                    <Copy /> Copiar o pedido e abrir o Gemini
                  </Button>
                  <span className="self-center text-xs text-muted">Lá: cole (Ctrl+V), gere e arraste a imagem de volta para cá.</span>
                </div>
              ) : null}
            </div>
          ) : (
            <Markdown texto={texto} />
          )
        ) : null}
        <Anexos anexos={m.anexos} grande />
        {m.fontes.length ? (
          <div className="flex flex-wrap gap-1.5">
            {m.fontes.map((f, i) => (
              <a
                key={f.url}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="flex max-w-60 items-center gap-1 truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:border-gold hover:text-foreground"
              >
                <Globe className="size-3 shrink-0" /> {i + 1}. {f.titulo}
              </a>
            ))}
          </div>
        ) : null}
        {m.memorias?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {m.memorias.map((f) => (
              <span key={f} className="flex items-center gap-1 rounded-full bg-gold/10 px-2.5 py-1 text-[11px] text-gold">
                <Brain className="size-3" /> Aprendi: {f}
              </span>
            ))}
          </div>
        ) : null}
        {!carregando && (texto || m.anexos.length || m.erro) ? (
          <div className="flex items-center gap-1 text-muted">
            {texto && !m.erro ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(texto);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                }}
                className="rounded-lg p-1.5 hover:bg-surface-2 hover:text-foreground"
                title="Copiar"
              >
                {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
              </button>
            ) : null}
            {podeRegenerar ? (
              <button type="button" onClick={onRegenerar} className="flex items-center gap-1 rounded-lg p-1.5 text-xs hover:bg-surface-2 hover:text-foreground" title="Gerar de novo">
                <RefreshCw className="size-4" /> {m.erro ? "Tentar de novo" : ""}
              </button>
            ) : null}
            {m.modelo ? <span className="ml-1 text-[11px]">{m.modelo}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
