"use client";

import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type Opcao<T = unknown> = { id: string; titulo: string; detalhe?: string; dados?: T };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Filtro local: todas as palavras precisam aparecer no título ou no detalhe (sem acento; dígitos ignoram pontuação). */
export function filtrarOpcoes<T>(opcoes: Opcao<T>[], termo: string) {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return opcoes;
  return opcoes.filter((o) => {
    const alvo = normalizar(`${o.titulo} ${o.detalhe ?? ""}`);
    const digitos = alvo.replace(/\D/g, "");
    return palavras.every((p) => {
      // "373.253" acha o CPF 37325331827: compara só os dígitos quando a palavra é numérica.
      const d = p.replace(/[.\-/]/g, "");
      return alvo.includes(p) || (/^\d{3,}$/.test(d) && digitos.includes(d));
    });
  });
}

/**
 * Campo de seleção com busca (substitui a lista suspensa quando há muitos itens).
 * `opcoes` filtra na tela; `buscar` consulta o servidor enquanto o usuário digita.
 */
export function BuscaSelect<T>({
  valor,
  onChange,
  opcoes,
  buscar,
  placeholder = "Digite para buscar...",
  vazio,
  disabled,
  className,
  autoFocus,
}: {
  valor: Opcao<T> | null;
  onChange: (opcao: Opcao<T> | null) => void;
  opcoes?: Opcao<T>[];
  buscar?: (termo: string) => Promise<Opcao<T>[]>;
  placeholder?: string;
  /** Rótulo da opção "nenhum" (ex.: "Consumidor final"); sem ele, o campo só limpa pelo X. */
  vazio?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [remotas, setRemotas] = useState<Opcao<T>[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();
  // A função de busca muda a cada render do pai: guarda a última numa ref para não refazer a consulta à toa.
  const buscarRef = useRef(buscar);
  useEffect(() => {
    buscarRef.current = buscar;
  });
  const remoto = Boolean(buscar);

  useEffect(() => {
    if (!aberto || !remoto) return;
    let cancelado = false;
    setCarregando(true);
    const t = setTimeout(() => {
      buscarRef.current!(termo)
        .then((r) => !cancelado && setRemotas(r))
        .catch(() => !cancelado && setRemotas([]))
        .finally(() => !cancelado && setCarregando(false));
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [termo, aberto, remoto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar();
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const filtradas = buscar ? remotas : filtrarOpcoes(opcoes ?? [], termo).slice(0, 100);
  const itens: (Opcao<T> | null)[] = vazio && !termo.trim() ? [null, ...filtradas] : filtradas;

  function fechar() {
    setAberto(false);
    setTermo("");
  }
  function escolher(o: Opcao<T> | null) {
    onChange(o);
    fechar();
    campo.current?.blur();
  }

  return (
    <div ref={caixa} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          ref={campo}
          role="combobox"
          aria-expanded={aberto}
          aria-controls={idLista}
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          value={aberto ? termo : valor ? `${valor.titulo}${valor.detalhe ? ` · ${valor.detalhe}` : ""}` : vazio && !aberto ? vazio : ""}
          placeholder={valor && aberto ? valor.titulo : placeholder}
          onFocus={() => {
            setAberto(true);
            setAtivo(0);
          }}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
            setAtivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, itens.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && aberto) {
              e.preventDefault();
              if (itens.length) escolher(itens[ativo] ?? null);
            } else if (e.key === "Escape") {
              fechar();
              campo.current?.blur();
            } else if (e.key === "Tab") {
              fechar();
            }
          }}
          className={cn(
            "h-10 w-full truncate rounded-xl border border-border bg-surface pr-16 pl-9 text-sm text-foreground transition-colors placeholder:text-muted/60 focus:border-transparent focus:outline-2 focus:outline-ring disabled:opacity-60",
            !aberto && !valor && vazio && "text-muted",
          )}
        />
        <span className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5 text-muted">
          {carregando && aberto ? <Loader2 className="size-4 animate-spin" /> : null}
          {valor && !disabled ? (
            <button type="button" onClick={() => escolher(null)} className="rounded-md p-1 hover:text-foreground" aria-label="Limpar">
              <X className="size-4" />
            </button>
          ) : null}
          <ChevronDown className="size-4" />
        </span>
      </div>
      {aberto ? (
        <ul ref={lista} id={idLista} role="listbox" className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-card">
          {itens.map((o, i) => (
            <li
              key={o?.id ?? "__vazio"}
              data-indice={i}
              role="option"
              aria-selected={o ? o.id === valor?.id : !valor}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn(
                "cursor-pointer rounded-lg px-3 py-2 text-sm",
                i === ativo ? "bg-surface-2 text-foreground" : "text-foreground",
                (o ? o.id === valor?.id : !valor) && "font-semibold",
              )}
            >
              {o ? (
                <>
                  <span className="block truncate">{o.titulo}</span>
                  {o.detalhe ? <span className="block truncate text-xs text-muted">{o.detalhe}</span> : null}
                </>
              ) : (
                <span className="text-muted">{vazio}</span>
              )}
            </li>
          ))}
          {!filtradas.length && !carregando ? <li className="px-3 py-2 text-sm text-muted">{termo ? "Nada encontrado." : "Digite para buscar."}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export type ClienteBusca = {
  id: string;
  nome: string;
  documento: string;
  email: string;
  enderecos: { id: string; apelido: string; cidade: string; uf: string; principal: boolean }[];
};

/** Busca de clientes no servidor (nome, CPF/CNPJ, e-mail ou telefone). */
export async function buscarClientes(termo: string, formatar: (doc: string) => string): Promise<Opcao<ClienteBusca>[]> {
  const res = await fetch(`/api/clientes/busca?q=${encodeURIComponent(termo)}`);
  if (!res.ok) return [];
  const { clientes } = (await res.json()) as { clientes: ClienteBusca[] };
  return clientes.map((c) => opcaoCliente(c, formatar));
}

export const opcaoCliente = (c: ClienteBusca, formatar: (doc: string) => string): Opcao<ClienteBusca> => ({
  id: c.id,
  titulo: c.nome,
  detalhe: [formatar(c.documento), c.enderecos.find((e) => e.principal)?.cidade ?? c.enderecos[0]?.cidade, c.email].filter(Boolean).join(" · "),
  dados: c,
});

/** Versão para formulários comuns: guarda a escolha e envia o id num campo oculto (`name`). */
export function BuscaSelectCampo<T>({
  name,
  opcoes,
  defaultId,
  required,
  onChange,
  ...resto
}: {
  name: string;
  opcoes: Opcao<T>[];
  defaultId?: string | null;
  required?: boolean;
  onChange?: (opcao: Opcao<T> | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [valor, setValor] = useState<Opcao<T> | null>(opcoes.find((o) => o.id === defaultId) ?? null);
  return (
    <>
      <BuscaSelect
        {...resto}
        valor={valor}
        opcoes={opcoes}
        onChange={(o) => {
          setValor(o);
          onChange?.(o);
        }}
      />
      {/* Campo oculto "required" não bloqueia o envio: o atributo vai no texto para o navegador avisar. */}
      <input type="hidden" name={name} value={valor?.id ?? ""} />
      {required ? <input tabIndex={-1} aria-hidden required value={valor?.id ?? ""} onChange={() => undefined} className="pointer-events-none absolute h-0 w-0 opacity-0" /> : null}
    </>
  );
}
