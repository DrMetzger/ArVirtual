import { Loader2 } from "lucide-react";

export default function Carregando() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-muted">
      <Loader2 className="size-8 animate-spin text-gold" />
      <p>Procurando quem vende na Shopee e no Mercado Livre…</p>
    </div>
  );
}
