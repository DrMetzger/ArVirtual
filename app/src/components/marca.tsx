import type { Marketplace } from "@/db/schema";
import { cn } from "@/lib/utils";

// Canal de venda: um dos marketplaces ou a loja própria (Sincrolab).
export type Canal = Marketplace | "loja";

export const CANAIS: Record<Canal, { nome: string; logo: string; logoEscuro?: string; logoClaro?: string; icone: string; iconeMenor?: boolean }> = {
  mercadolivre: { nome: "Mercado Livre", logo: "/marcas/mercadolivre.png", logoEscuro: "/marcas/mercadolivre-escuro.png", icone: "/marcas/mercadolivre-icone.png" },
  // A sacola da Shopee ocupa o quadrado inteiro: um pouco menor para ficar do tamanho dos outros ícones.
  shopee: { nome: "Shopee", logo: "/marcas/shopee.png", icone: "/marcas/shopee-icone.png", iconeMenor: true },
  magalu: { nome: "Magalu", logo: "/marcas/magalu.png", icone: "/marcas/magalu-icone.png" },
  // O logo original tem o texto branco: no tema claro usa a versão com texto azul-marinho.
  loja: { nome: "Sincrolab", logo: "/marcas/sincrolab.png", logoClaro: "/marcas/sincrolab-claro.png", icone: "/marcas/sincrolab-icone.png" },
};

/** Ícone do canal num quadradinho branco (como ícone de app): fica legível no tema claro e no escuro. */
export function MarcaIcone({ canal, className }: { canal: Canal; className?: string }) {
  const c = CANAIS[canal];
  return (
    <span title={c.nome} className={cn("grid size-6 shrink-0 place-items-center rounded-md bg-white p-[3px] shadow-sm ring-1 ring-black/10", className)}>
      <img src={c.icone} alt={c.nome} className={cn("size-full object-contain", c.iconeMenor && "scale-[0.72]")} />
    </span>
  );
}

/**
 * Logo completo do canal numa plaquinha branca, com as cores originais da marca:
 * fica igual e legível no tema claro e no escuro (o mesmo critério do ícone).
 */
export function MarcaLogo({ canal, className }: { canal: Canal; className?: string }) {
  const c = CANAIS[canal];
  return (
    <span title={c.nome} className="inline-flex shrink-0 items-center rounded-lg bg-white px-2.5 py-1.5 align-middle shadow-sm ring-1 ring-black/10">
      <img src={c.logoClaro ?? c.logo} alt={c.nome} className={cn("h-6 w-auto object-contain", className)} />
    </span>
  );
}
