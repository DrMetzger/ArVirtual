"use client";

import { Brain, ChevronDown, Folder, FolderInput, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import type { ConversaTela } from "@/lib/assistente/tipos";
import { cn } from "@/lib/utils";
import { alternarMemoria, buscarConversas, excluirConversa, excluirMemoria, fixarConversa, listarMemorias, moverConversa, renomearConversa, salvarMemoria } from "./actions";

const DIA = 86400_000;
function grupoData(iso: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= hoje.getTime()) return "Hoje";
  if (t >= hoje.getTime() - DIA) return "Ontem";
  if (t >= hoje.getTime() - 7 * DIA) return "Últimos 7 dias";
  if (t >= hoje.getTime() - 30 * DIA) return "Últimos 30 dias";
  return "Mais antigas";
}

type Props = {
  conversas: ConversaTela[];
  atual: string | null;
  onNova: () => void;
  onAlterar: (id: string, mudanca: Partial<ConversaTela> | null) => void;
  onAbrir: () => void;
  totalMemorias: number;
};

export function Organizador({ conversas, atual, onNova, onAlterar, onAbrir, totalMemorias }: Props) {
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<string[] | null>(null);
  const [fechadas, setFechadas] = useState<string[]>([]);
  const [memoriaAberta, setMemoriaAberta] = useState(false);

  // Busca no conteúdo das mensagens (servidor); o título filtra na hora.
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setAchadas(null);
      return;
    }
    const t = setTimeout(() => void buscarConversas(q).then(setAchadas), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const pastas = useMemo(() => [...new Set(conversas.map((c) => c.pasta).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [conversas]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (q.length < 2) return conversas;
    return conversas.filter((c) => c.titulo.toLowerCase().includes(q) || achadas?.includes(c.id));
  }, [conversas, busca, achadas]);

  const grupos: { nome: string; pasta?: boolean; itens: ConversaTela[] }[] = [];
  const fixadas = visiveis.filter((c) => c.fixada);
  if (fixadas.length) grupos.push({ nome: "Fixadas", itens: fixadas });
  for (const p of pastas) {
    const itens = visiveis.filter((c) => !c.fixada && c.pasta === p);
    if (itens.length) grupos.push({ nome: p, pasta: true, itens });
  }
  for (const c of visiveis.filter((x) => !x.fixada && !x.pasta)) {
    const g = grupoData(c.atualizadoEm);
    const existente = grupos.find((x) => x.nome === g && !x.pasta);
    if (existente) existente.itens.push(c);
    else grupos.push({ nome: g, itens: [c] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button variant="gold" onClick={onNova} className="w-full">
        <Plus /> Nova conversa
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas conversas" className="h-9 pl-9" />
        {busca ? (
          <button type="button" onClick={() => setBusca("")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted hover:text-foreground" aria-label="Limpar busca">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {!visiveis.length ? (
          <p className="px-2 py-6 text-center text-xs text-muted">{busca ? "Nada encontrado." : "Suas conversas aparecem aqui."}</p>
        ) : null}
        {grupos.map((g) => {
          const fechada = fechadas.includes(g.nome);
          return (
            <div key={`${g.pasta ? "p" : "g"}-${g.nome}`} className="mb-3">
              <button
                type="button"
                onClick={() => setFechadas((f) => (fechada ? f.filter((x) => x !== g.nome) : [...f, g.nome]))}
                className="flex w-full items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase hover:text-foreground"
              >
                {g.pasta ? <Folder className="size-3.5 text-gold" /> : g.nome === "Fixadas" ? <Pin className="size-3.5 text-gold" /> : null}
                <span className="truncate">{g.nome}</span>
                <span className="font-normal normal-case">({g.itens.length})</span>
                <ChevronDown className={cn("ml-auto size-3.5 transition", fechada && "-rotate-90")} />
              </button>
              {fechada ? null : (
                <ul className="grid gap-0.5">
                  {g.itens.map((c) => (
                    <ItemConversa key={c.id} c={c} ativa={c.id === atual} pastas={pastas} onAlterar={onAlterar} onAbrir={onAbrir} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setMemoriaAberta(true)}
        className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm transition hover:border-gold"
      >
        <Brain className="size-4 text-gold" />
        <span className="flex-1">
          <span className="block font-semibold">Memória da IA</span>
          <span className="block text-xs text-muted">{totalMemorias} fato(s) aprendido(s)</span>
        </span>
      </button>
      {memoriaAberta ? <PainelMemoria onFechar={() => setMemoriaAberta(false)} /> : null}
    </div>
  );
}

function ItemConversa({
  c,
  ativa,
  pastas,
  onAlterar,
  onAbrir,
}: {
  c: ConversaTela;
  ativa: boolean;
  pastas: string[];
  onAlterar: Props["onAlterar"];
  onAbrir: () => void;
}) {
  const [menu, setMenu] = useState<null | "acoes" | "pasta">(null);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(c.titulo);
  const [novaPasta, setNovaPasta] = useState("");
  const [, start] = useTransition();
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [menu]);

  const mover = (pasta: string) => {
    setMenu(null);
    onAlterar(c.id, { pasta });
    start(() => moverConversa(c.id, pasta));
  };

  if (editando) {
    return (
      <li>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setEditando(false);
            if (titulo.trim() && titulo !== c.titulo) {
              onAlterar(c.id, { titulo: titulo.trim() });
              start(() => renomearConversa(c.id, titulo));
            }
          }}
        >
          <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="h-8 text-sm" maxLength={80} />
        </form>
      </li>
    );
  }

  return (
    <li ref={ref} className="group relative">
      <Link
        href={`/assistente/${c.id}`}
        onClick={onAbrir}
        className={cn(
          "block truncate rounded-lg py-2 pr-8 pl-2.5 text-sm transition",
          ativa ? "bg-primary/15 font-semibold text-foreground ring-1 ring-primary/40" : "text-muted hover:bg-surface-2 hover:text-foreground",
        )}
        title={c.titulo}
      >
        {c.titulo}
      </Link>
      <button
        type="button"
        onClick={() => setMenu(menu ? null : "acoes")}
        className={cn(
          "absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-surface hover:text-foreground",
          menu || ativa ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100",
        )}
        aria-label="Opções da conversa"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menu ? (
        <div className="absolute top-full right-0 z-30 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-card">
          {menu === "acoes" ? (
            <>
              <MenuItem
                icon={<Pencil />}
                onClick={() => {
                  setMenu(null);
                  setTitulo(c.titulo);
                  setEditando(true);
                }}
              >
                Renomear
              </MenuItem>
              <MenuItem
                icon={c.fixada ? <PinOff /> : <Pin />}
                onClick={() => {
                  setMenu(null);
                  onAlterar(c.id, { fixada: !c.fixada });
                  start(() => fixarConversa(c.id, !c.fixada));
                }}
              >
                {c.fixada ? "Desafixar" : "Fixar no topo"}
              </MenuItem>
              <MenuItem icon={<FolderInput />} onClick={() => setMenu("pasta")}>
                Mover para pasta
              </MenuItem>
              <MenuItem
                icon={<Trash2 />}
                perigo
                onClick={() => {
                  setMenu(null);
                  if (!confirm(`Excluir a conversa "${c.titulo}"? Os arquivos dela também serão apagados.`)) return;
                  onAlterar(c.id, null);
                  start(() => excluirConversa(c.id));
                }}
              >
                Excluir
              </MenuItem>
            </>
          ) : (
            <>
              <p className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">Mover para</p>
              {c.pasta ? (
                <MenuItem icon={<X />} onClick={() => mover("")}>
                  Tirar da pasta
                </MenuItem>
              ) : null}
              {pastas
                .filter((p) => p !== c.pasta)
                .map((p) => (
                  <MenuItem key={p} icon={<Folder />} onClick={() => mover(p)}>
                    {p}
                  </MenuItem>
                ))}
              <form
                className="flex gap-1 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (novaPasta.trim()) mover(novaPasta.trim());
                }}
              >
                <Input autoFocus value={novaPasta} onChange={(e) => setNovaPasta(e.target.value)} placeholder="Nova pasta" className="h-8 text-xs" maxLength={40} />
                <Button size="sm" type="submit" variant="outline">
                  OK
                </Button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function MenuItem({ icon, children, onClick, perigo }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-surface-2 [&_svg]:size-4",
        perigo ? "text-red" : "text-foreground",
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

type Memoria = Awaited<ReturnType<typeof listarMemorias>>[number];

function PainelMemoria({ onFechar }: { onFechar: () => void }) {
  const [lista, setLista] = useState<Memoria[] | null>(null);
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [pendente, start] = useTransition();
  const recarregar = () => start(async () => setLista(await listarMemorias()));

  useEffect(recarregar, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-start gap-3 border-b border-border p-5">
          <Brain className="mt-0.5 size-5 text-gold" />
          <div className="flex-1">
            <p className="font-display text-lg font-bold">Memória da IA</p>
            <p className="text-sm text-muted">
              Fatos que o assistente aprendeu nas conversas e usa em todas as respostas. Corrija, desligue ou apague o que estiver errado.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar">
            <X />
          </Button>
        </div>
        <form
          className="flex gap-2 border-b border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nova.trim()) return;
            const t = nova;
            setNova("");
            start(async () => {
              await salvarMemoria(null, t);
              setLista(await listarMemorias());
            });
          }}
        >
          <Input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ensinar algo: ex. nosso PLA preto é da Voolt3D" maxLength={500} />
          <Button type="submit" variant="gold" disabled={pendente || !nova.trim()}>
            <Plus /> Adicionar
          </Button>
        </form>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {lista === null ? <li className="p-6 text-center text-sm text-muted">Carregando...</li> : null}
          {lista?.length === 0 ? <li className="p-6 text-center text-sm text-muted">Nada aprendido ainda. Conte sobre a empresa nas conversas ou adicione acima.</li> : null}
          {lista?.map((m) => (
            <li key={m.id} className={cn("flex items-start gap-3 px-5 py-3", !m.ativo && "opacity-50")}>
              <input
                type="checkbox"
                checked={m.ativo}
                title={m.ativo ? "Em uso (clique para desligar)" : "Desligada"}
                onChange={(e) => {
                  const ativo = e.target.checked;
                  setLista((l) => l?.map((x) => (x.id === m.id ? { ...x, ativo } : x)) ?? null);
                  start(() => alternarMemoria(m.id, ativo));
                }}
                className="mt-1 accent-[var(--gold)]"
              />
              {editando?.id === m.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = editando.texto;
                    setEditando(null);
                    setLista((l) => l?.map((x) => (x.id === m.id ? { ...x, texto: t } : x)) ?? null);
                    start(() => salvarMemoria(m.id, t));
                  }}
                >
                  <Input autoFocus value={editando.texto} onChange={(e) => setEditando({ id: m.id, texto: e.target.value })} className="h-8 text-sm" />
                  <Button size="sm" type="submit">
                    Salvar
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 text-sm">
                    {m.texto}
                    <span className="block text-xs text-muted">{new Date(m.criadoEm).toLocaleDateString("pt-BR")}</span>
                  </span>
                  <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditando({ id: m.id, texto: m.texto })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Apagar"
                    onClick={() => {
                      setLista((l) => l?.filter((x) => x.id !== m.id) ?? null);
                      start(() => excluirMemoria(m.id));
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
