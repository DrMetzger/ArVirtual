import { Loader2 } from "lucide-react";

export default function Carregando() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-muted">
      <Loader2 className="size-8 animate-spin text-gold" />
      <p>Procurando quem vende no Magalu, Mercado Livre e Shopee… (até 1 minuto)</p>
    </div>
  );
}
