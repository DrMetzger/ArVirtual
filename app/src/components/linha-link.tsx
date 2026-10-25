"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const INTERATIVO = "a, button, input, select, textarea, label, summary, [role=button], [data-sem-link]";

/**
 * Linha de tabela inteira clicável (abre o cadastro/documento). Cliques em botões, links e campos
 * dentro da linha continuam funcionando; Ctrl/⌘ ou botão do meio abrem em outra aba.
 */
export function LinhaLink({ href, className, children, ...props }: ComponentProps<"tr"> & { href: string }) {
  const router = useRouter();
  const abrir = (e: React.MouseEvent<HTMLTableRowElement>, novaAba: boolean) => {
    if ((e.target as HTMLElement).closest(INTERATIVO)) return;
    // Texto selecionado com o mouse: o usuário quis copiar, não navegar.
    if (window.getSelection()?.toString()) return;
    if (novaAba) window.open(href, "_blank");
    else router.push(href);
  };
  return (
    <tr
      {...props}
      onClick={(e) => abrir(e, e.ctrlKey || e.metaKey)}
      onAuxClick={(e) => e.button === 1 && abrir(e, true)}
      onMouseEnter={() => router.prefetch(href)}
      className={cn("cursor-pointer transition-colors hover:bg-surface-2/70", className)}
    >
      {children}
    </tr>
  );
}
