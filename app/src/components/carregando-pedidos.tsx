import { MarcaLogo, type Canal } from "@/components/marca";

const ORDEM: Canal[] = ["mercadolivre", "shopee", "magalu", "loja"];

/** Tela de carregamento dos pedidos: os logos dos canais acendem em sequência. */
export function CarregandoPedidos({ texto = "Carregando pedidos..." }: { texto?: string }) {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="grid justify-items-center gap-6">
        <div className="flex flex-wrap items-center justify-center gap-8">
          {ORDEM.map((c, i) => (
            <div key={c} className="animate-pulse" style={{ animationDelay: `${i * 250}ms`, animationDuration: "1.6s" }}>
              <MarcaLogo canal={c} className="h-9" />
            </div>
          ))}
        </div>
        <p className="text-sm font-semibold text-muted">{texto}</p>
      </div>
    </div>
  );
}
