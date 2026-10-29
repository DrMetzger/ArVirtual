"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  Landmark,
  Wallet,
  FileInput,
  Printer,
  Spool,
  Truck,
  ChevronDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Users,
  X,
  type LucideIcon,
  BadgePercent,
  Smartphone,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/ui/client";
import { COOKIE_MENU } from "@/lib/menu";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon };
type Grupo = { label: string; icon: LucideIcon; itens: Item[] };

// Módulos do backoffice, cada um no seu grupo.
const NAV: (Item | Grupo)[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Cadastros",
    icon: FolderOpen,
    itens: [
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/fiscal", label: "Matriz fiscal", icon: Scale },
    ],
  },
  {
    label: "Vendas",
    icon: ShoppingCart,
    itens: [
      { href: "/pedidos", label: "Pedidos", icon: ShoppingCart },
      { href: "/notas", label: "Notas fiscais", icon: FileText },
    ],
  },
  {
    label: "Estoque",
    icon: Boxes,
    itens: [
      { href: "/estoque", label: "Produtos acabados", icon: Package },
      { href: "/estoque/filamentos", label: "Filamentos", icon: Spool },
      { href: "/estoque/producao", label: "Produção", icon: Printer },
    ],
  },
  {
    label: "Compras",
    icon: Truck,
    itens: [
      { href: "/compras/notas", label: "Notas de entrada", icon: FileInput },
      { href: "/compras/fornecedores", label: "Fornecedores", icon: Truck },
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    itens: [
      { href: "/financeiro", label: "Visão geral", icon: Wallet },
      { href: "/financeiro/receber", label: "Contas a receber", icon: ArrowDownCircle },
      { href: "/financeiro/pagar", label: "Contas a pagar", icon: ArrowUpCircle },
      { href: "/financeiro/contas", label: "Contas bancárias", icon: Landmark },
    ],
  },
  { href: "/marketplaces", label: "Marketplaces", icon: Store },
  { href: "/afiliados", label: "Afiliados Shopee", icon: BadgePercent },
  { href: "/assistente", label: "Assistente IA", icon: Sparkles },
];
const CONFIGURACOES: Item = { href: "/configuracoes", label: "Configurações", icon: Settings };

export type Usuario = { nome: string; papel: string; iniciais: string };

const TODOS = NAV.flatMap((n) => ("itens" in n ? n.itens : [n])).map((i) => i.href);
const casa = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
// O item mais específico vence: em /estoque/filamentos, "Filamentos" fica ativo e "Produtos acabados" não.
const ativo = (pathname: string, href: string) => casa(pathname, href) && !TODOS.some((h) => h.length > href.length && h.startsWith(href) && casa(pathname, h));

function Brand({ recolhido }: { recolhido?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3", recolhido ? "justify-center" : "px-2")}>
      <Image src="/logo-mark-dark.png" alt="ArVirtual" width={48} height={28} priority className={recolhido ? "w-10" : undefined} />
      {recolhido ? null : (
        <div className="leading-none">
          <p className="font-display text-base font-extrabold tracking-wide text-white">ARVIRTUAL</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e6c158]">Pesquisa &amp; Desenvolvimento</p>
        </div>
      )}
    </Link>
  );
}

function Link_({ item, recolhido, sub, onNavigate }: { item: Item; recolhido?: boolean; sub?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const on = ativo(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={recolhido ? item.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors",
        recolhido ? "justify-center px-0" : sub ? "pr-3 pl-10" : "px-3",
        on ? "bg-white/8 text-sidebar-active" : "text-sidebar-fg hover:bg-white/5 hover:text-white",
      )}
    >
      {on && !sub ? <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#ef4b51]" /> : null}
      <Icon className={cn(sub ? "size-4" : "size-[18px]", on ? "text-[#e6c158]" : "opacity-70 group-hover:opacity-100")} />
      {recolhido ? null : item.label}
    </Link>
  );
}

function GrupoNav({ grupo, recolhido, onNavigate }: { grupo: Grupo; recolhido?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const dentro = grupo.itens.some((i) => ativo(pathname, i.href));
  const [aberto, setAberto] = useState(dentro);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (dentro) setAberto(true);
  }, [dentro]);
  // Recolhido, o grupo abre como menu flutuante: fecha ao navegar ou clicar fora.
  useEffect(() => {
    if (recolhido) setAberto(false);
  }, [recolhido, pathname]);
  useEffect(() => {
    if (!recolhido || !aberto) return;
    const fora = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [recolhido, aberto]);

  const Icon = grupo.icon;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={recolhido ? grupo.label : undefined}
        aria-expanded={aberto}
        className={cn(
          "group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors",
          recolhido ? "justify-center px-0" : "px-3",
          dentro ? "text-sidebar-active" : "text-sidebar-fg hover:bg-white/5 hover:text-white",
          dentro && recolhido && "bg-white/8",
        )}
      >
        {dentro ? <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#ef4b51]" /> : null}
        <Icon className={cn("size-[18px]", dentro ? "text-[#e6c158]" : "opacity-70 group-hover:opacity-100")} />
        {recolhido ? null : (
          <>
            <span className="flex-1 text-left">{grupo.label}</span>
            <ChevronDown className={cn("size-4 opacity-60 transition-transform", aberto && "rotate-180")} />
          </>
        )}
      </button>

      {recolhido ? (
        aberto ? (
          <div className="absolute top-0 left-full z-50 ml-3 w-52 rounded-xl border border-white/10 bg-sidebar p-2 shadow-2xl">
            <p className="px-3 pt-1 pb-2 text-[10px] font-semibold tracking-[0.2em] text-[#e6c158] uppercase">{grupo.label}</p>
            {grupo.itens.map((i) => (
              <Link_ key={i.href} item={i} onNavigate={onNavigate} />
            ))}
          </div>
        ) : null
      ) : (
        <div className={cn("grid overflow-hidden transition-all duration-200", aberto ? "mt-1 grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="grid min-h-0 gap-1">
            {grupo.itens.map((i) => (
              <Link_ key={i.href} item={i} sub onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NavLinks({ recolhido, onNavigate }: { recolhido?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="mt-8 grid gap-1">
      {NAV.map((n) =>
        "itens" in n ? (
          <GrupoNav key={n.label} grupo={n} recolhido={recolhido} onNavigate={onNavigate} />
        ) : (
          <Link_ key={n.href} item={n} recolhido={recolhido} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}

function Rodape({ usuario, recolhido, onNavigate, appAndroid }: { usuario: Usuario; recolhido?: boolean; onNavigate?: () => void; appAndroid?: string }) {
  return (
    <div className="mt-auto grid gap-2">
      {appAndroid ? (
        // Download do APK (link comum: é um arquivo, não uma página).
        <a
          href="/baixar/android"
          title={`Baixar o app Android (versão ${appAndroid})`}
          className={cn(
            "group flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium text-sidebar-fg transition-colors hover:bg-white/5 hover:text-white",
            recolhido ? "justify-center px-0" : "px-3",
          )}
        >
          <Smartphone className="size-[18px] text-[#e6c158] opacity-90 group-hover:opacity-100" />
          {recolhido ? null : (
            <span className="flex-1">
              App Android <span className="text-xs text-sidebar-fg/70">v{appAndroid}</span>
            </span>
          )}
        </a>
      ) : null}
      <Link_ item={CONFIGURACOES} recolhido={recolhido} onNavigate={onNavigate} />
      <div className={cn("flex items-center gap-3 rounded-xl bg-white/5", recolhido ? "flex-col p-2" : "p-3")}>
        <div
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#d4af37] text-sm font-bold text-[#0a1a33]"
          title={recolhido ? `${usuario.nome} (${usuario.papel})` : undefined}
        >
          {usuario.iniciais}
        </div>
        {recolhido ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white" title={usuario.nome}>
              {usuario.nome.split(" ")[0]}
            </p>
            <p className="text-xs capitalize text-sidebar-fg">{usuario.papel}</p>
          </div>
        )}
        <ThemeToggle className="border-white/10 bg-transparent text-white hover:text-[#e6c158]" />
        <form action={logout}>
          <button type="submit" className="grid size-9 place-items-center rounded-lg text-sidebar-fg hover:text-[#ef4b51]" title="Sair">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar({
  usuario,
  recolhidoInicial,
  appAndroid,
  children,
}: {
  usuario: Usuario;
  recolhidoInicial: boolean;
  /** Versão do APK disponível para baixar (vazio dentro do próprio app ou sem APK). */
  appAndroid?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  function alternar() {
    const novo = !recolhido;
    setRecolhido(novo);
    document.cookie = `${COOKIE_MENU}=${novo ? "recolhido" : "aberto"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-sidebar transition-[width] duration-200 lg:flex",
          recolhido ? "w-[76px] px-3 py-4" : "w-64 p-4",
        )}
      >
        <Brand recolhido={recolhido} />
        <button
          type="button"
          onClick={alternar}
          className="absolute top-6 -right-3 grid size-6 place-items-center rounded-full border border-white/15 bg-sidebar text-sidebar-fg shadow-md hover:text-[#e6c158]"
          title={recolhido ? "Expandir menu" : "Recolher menu"}
          aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
        >
          {recolhido ? <PanelLeftOpen className="size-3.5" /> : <PanelLeftClose className="size-3.5" />}
        </button>
        <NavLinks recolhido={recolhido} />
        <Rodape usuario={usuario} recolhido={recolhido} appAndroid={appAndroid} />
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sidebar px-4 lg:hidden">
        <Brand />
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-lg text-white" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-y-auto bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="text-white" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <Rodape usuario={usuario} onNavigate={() => setOpen(false)} appAndroid={appAndroid} />
          </aside>
        </div>
      ) : null}

      <main className={cn("px-4 py-6 transition-[margin] duration-200 sm:px-8 sm:py-8", recolhido ? "lg:ml-[76px]" : "lg:ml-64")}>
        <div className="mx-auto max-w-[1600px]">{children}</div>
      </main>
    </>
  );
}
