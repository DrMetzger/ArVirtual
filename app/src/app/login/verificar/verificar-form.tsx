"use client";

import { ArrowLeft, Loader2, MailCheck, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import { reenviarCodigo, verificarCodigo } from "../actions";

export function VerificarForm() {
  const [state, onSubmit, pending] = useFormAction(verificarCodigo, null);
  const [reenvio, setReenvio] = useState<{ erro?: string; ok?: string } | null>(null);
  const [reenviando, start] = useTransition();

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Código">
        <Input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="000000"
          className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="lembrar" className="size-4 accent-[var(--gold)]" />
        Confiar neste navegador por 30 dias
      </label>
      {state?.erro ? <Alert>{state.erro}</Alert> : null}
      {reenvio?.erro ? <Alert>{reenvio.erro}</Alert> : null}
      {reenvio?.ok ? <Alert tone="green">{reenvio.ok}</Alert> : null}
      <SubmitButton pending={pending} size="lg" pendingText="Conferindo...">
        <MailCheck /> Confirmar
      </SubmitButton>
      <div className="flex items-center justify-between">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
        <Button type="button" variant="ghost" size="sm" disabled={reenviando} onClick={() => start(async () => setReenvio(await reenviarCodigo()))}>
          {reenviando ? <Loader2 className="animate-spin" /> : <RotateCw />} Reenviar código
        </Button>
      </div>
    </form>
  );
}
