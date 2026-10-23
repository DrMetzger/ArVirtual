"use client";

import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { AddressFields, emptyAddress, type AddressValues } from "@/components/address-fields";
import { Alert, Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import type { Endereco } from "@/db/schema";
import { formatCep } from "@/lib/utils";
import { excluirEndereco, salvarEndereco, tornarPrincipal } from "./actions";

function EnderecoEditor({ clienteId, endereco, onDone }: { clienteId: string; endereco?: Endereco; onDone: () => void }) {
  const [state, action] = useActionState(salvarEndereco, null);
  const [value, setValue] = useState<AddressValues>(
    endereco ? { ...endereco, cep: formatCep(endereco.cep) } : { ...emptyAddress, apelido: "Entrega" },
  );
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="grid gap-4 rounded-xl border border-gold/40 bg-surface-2 p-4">
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="enderecoId" value={endereco?.id ?? ""} />
      <AddressFields value={value} onChange={setValue} />
      {state?.erro ? <Alert>{state.erro}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <SubmitButton pendingText="Salvando...">Salvar endereço</SubmitButton>
      </div>
    </form>
  );
}

export function Enderecos({ clienteId, enderecos }: { clienteId: string; enderecos: Endereco[] }) {
  const [editando, setEditando] = useState<string | "novo" | null>(null);
  const [pending, start] = useTransition();
  const fechar = () => setEditando(null);

  return (
    <Card>
      <CardHeader
        title="Endereços"
        description="Um cliente pode ter vários endereços. O principal é sugerido na nota fiscal."
        action={
          <Button variant="outline" size="sm" onClick={() => setEditando("novo")} disabled={editando === "novo"}>
            <Plus /> Novo endereço
          </Button>
        }
      />
      <div className="grid gap-3 p-5">
        {editando === "novo" ? <EnderecoEditor clienteId={clienteId} onDone={fechar} /> : null}
        {enderecos.length === 0 && editando !== "novo" ? (
          <EmptyState icon={<MapPin />} title="Nenhum endereço" description="Cadastre ao menos um endereço para emitir notas." />
        ) : null}
        {enderecos.map((e) =>
          editando === e.id ? (
            <EnderecoEditor key={e.id} clienteId={clienteId} endereco={e} onDone={fechar} />
          ) : (
            <div key={e.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-border p-4">
              <div className="grid size-10 place-items-center rounded-xl bg-surface-2 text-gold">
                <MapPin className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{e.apelido}</p>
                  {e.principal ? <Badge tone="gold">Principal</Badge> : null}
                </div>
                <p className="text-sm text-muted">
                  {e.logradouro}, {e.numero}
                  {e.complemento ? ` · ${e.complemento}` : ""} · {e.bairro}
                </p>
                <p className="text-sm text-muted">
                  {e.cidade}/{e.uf} · CEP {formatCep(e.cep)}
                  {e.codigoIbge ? ` · IBGE ${e.codigoIbge}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {!e.principal ? (
                  <Button variant="ghost" size="icon" title="Tornar principal" disabled={pending} onClick={() => start(() => tornarPrincipal(clienteId, e.id))}>
                    <Star />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" title="Editar" onClick={() => setEditando(e.id)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Excluir"
                  className="hover:text-red"
                  disabled={pending}
                  onClick={() => confirm(`Excluir o endereço "${e.apelido}"?`) && start(() => excluirEndereco(clienteId, e.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </Card>
  );
}
