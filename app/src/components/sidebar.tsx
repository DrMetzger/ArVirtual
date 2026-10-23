"use client";

import {
  FileText,
  LayoutDashboard,
  Menu,
  Package,
  Scale,
  Settings,
  Sparkles,
  Store,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/notas", label: "Notas fiscais", icon: FileText },
  { href: "/fiscal", label: "Matriz fiscal", icon: Scale },
  { href: "/marketplaces", label: "Marketplaces", icon: Store },
  { href: "/assistente", label: "Assistente IA", icon: Sparkles },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <Image src="/logo-mark-dark.png" alt="" width={48} height={28} priority />
      <div className="leading-none">
        <p className="font-display text-base font-extrabold tracking-wide text-white">ARVIRTUAL</p>
        <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#e6c158]">Pesquisa &amp; Desenvolvimento</p>
      </div>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="mt-8 grid gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-white/8 text-sidebar-active" : "text-sidebar-fg hover:bg-white/5 hover:text-white",
            )}
          >
            {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#ef4b51]" /> : null}
            <Icon className={cn("size-[18px]", active ? "text-[#e6c158]" : "opacity-70 group-hover:opacity-100")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ footer }: { footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar p-4 lg:flex">
        <Brand />
        <NavLinks />
        <div className="mt-auto">{footer}</div>
      </aside>

      {/* Mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-sidebar px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-lg text-white"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="text-white" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto">{footer}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
