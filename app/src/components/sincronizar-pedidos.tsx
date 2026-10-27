"use client";

import { RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { sincronizarManual } from "@/app/(app)/pedidos/actions";

type Conta = { id: number; nome: string; marketplaceNome: string };

const dia = (d: Date) => d.toLocaleDateString("sv-SE"); // AAAA-MM-DD no fuso do navegador

/** Botão "Sincronizar": escolhe plataforma e período (por data da compra) em vez de puxar tudo de novo. */
export function SincronizarPedidos({ contas, voltar }: { contas: Conta[]; voltar: string }) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();
  const semana = new Date(hoje.getTime() - 7 * 86400_000);
  return (
    <>
      <Button type="button" variant="gold" onClick={() => setAberto(true)} disabled={!contas.length}>
        <RefreshCw /> Sincronizar
      </Button>
      {aberto ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && setAberto(false)}>
          <form action={sincronizarManual.bind(null, voltar)} className="grid w-full max-w-md gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <p className="font-display text-lg font-bold">Sincronizar pedidos</p>
                <p className="text-sm text-muted">
                  Os pedidos já entram sozinhos (avisos dos marketplaces e conferência a cada 15 minutos). Use aqui para buscar um período específico.
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setAberto(false)} aria-label="Fechar">
                <X />
              </Button>
            </div>
            <Field label="Plataforma">
              <Select name="conta" defaultValue="">
                <option value="">Todas as contas</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.marketplaceNome} · {c.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Compras de">
                <Input type="date" name="de" defaultValue={dia(semana)} max={dia(hoje)} required />
              </Field>
              <Field label="Até">
                <Input type="date" name="ate" defaultValue={dia(hoje)} max={dia(hoje)} required />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <SubmitButton name="modo" value="novidades" variant="outline" formNoValidate>
                Só novidades
              </SubmitButton>
              <SubmitButton name="modo" value="periodo" variant="gold" pendingText="Sincronizando...">
                <RefreshCw /> Sincronizar período
              </SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
