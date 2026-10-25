"use client";

import { Link2 } from "lucide-react";
import { useActionState } from "react";
import { BuscaSelectCampo } from "@/components/busca-select";
import { SubmitButton } from "@/components/ui/client";
import { vincularProduto } from "../actions";

/** Item sem produto: escolher o produto do cadastro; o vínculo vale para os próximos pedidos com o mesmo SKU. */
export function Vincular({ pedidoId, chaves, produtos }: { pedidoId: number; chaves: string[]; produtos: { id: string; nome: string; sku: string }[] }) {
  const [state, action, pending] = useActionState(vincularProduto.bind(null, pedidoId, chaves), null);
  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-80">
        <BuscaSelectCampo
          name="produtoId"
          required
          opcoes={produtos.map((p) => ({ id: p.id, titulo: p.nome, detalhe: p.sku }))}
          placeholder="É qual produto do cadastro?"
        />
      </div>
      <SubmitButton size="sm" variant="outline" pending={pending} pendingText="...">
        <Link2 /> Vincular
      </SubmitButton>
      {state && "erro" in state && state.erro ? <span className="text-xs text-red">{state.erro}</span> : null}
    </form>
  );
}
