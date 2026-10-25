import type { Marketplace } from "@/db/schema";
import { cn } from "@/lib/utils";

// Canal de venda: um dos marketplaces ou a loja própria (Sincrolab).
export type Canal = Marketplace | "loja";

export const CANAIS: Record<Canal, { nome: string; logo: string; logoEscuro?: string; logoClaro?: string; icone: string }> = {
  mercadolivre: { nome: "Mercado Livre", logo: "/marcas/mercadolivre.png", logoEscuro: "/marcas/mercadolivre-escuro.png", icone: "/marcas/mercadolivre-icone.png" },
  shopee: { nome: "Shopee", logo: "/marcas/shopee.png", icone: "/marcas/shopee-icone.png" },
  magalu: { nome: "Magalu", logo: "/marcas/magalu.png", icone: "/marcas/magalu-icone.png" },
  // O logo original tem o texto branco: no tema claro usa a versão com texto azul-marinho.
  loja: { nome: "Sincrolab", logo: "/marcas/sincrolab.png", logoClaro: "/marcas/sincrolab-claro.png", icone: "/marcas/sincrolab-icone.png" },
};

/** Ícone quadrado do canal (listas, tabelas, badges). */
export function MarcaIcone({ canal, className }: { canal: Canal; className?: string }) {
  const c = CANAIS[canal];
  return <img src={c.icone} alt={c.nome} title={c.nome} className={cn("size-5 shrink-0 object-contain", className)} />;
}

/** Logo completo do canal, com a versão certa para o tema claro/escuro. */
export function MarcaLogo({ canal, className }: { canal: Canal; className?: string }) {
  const c = CANAIS[canal];
  const claro = c.logoClaro ?? c.logo;
  const escuro = c.logoEscuro ?? c.logo;
  if (claro === escuro) return <img src={c.logo} alt={c.nome} className={cn("h-6 w-auto object-contain", className)} />;
  return (
    <>
      <img src={claro} alt={c.nome} className={cn("h-6 w-auto object-contain dark:hidden", className)} />
      <img src={escuro} alt={c.nome} className={cn("hidden h-6 w-auto object-contain dark:block", className)} />
    </>
  );
}
