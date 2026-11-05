"use client";

import Link from "next/link";
import { Alert, Field, Input } from "@/components/ui";
import { InputSenha, SubmitButton, useFormAction } from "@/components/ui/client";
import { esqueciSenha } from "./actions";

export function EsqueciForm() {
  const [estado, onSubmit, pending] = useFormAction(esqueciSenha, null);
  const etapa = estado?.etapa ?? "email";
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {etapa === "email" ? (
        <>
          <Field label="E-mail cadastrado">
            <Input name="email" type="email" autoComplete="email" defaultValue={estado?.email} required autoFocus />
          </Field>
          {estado?.erro ? <Alert>{estado.erro}</Alert> : null}
          <SubmitButton pending={pending} size="lg" pendingText="Enviando...">
            Enviar código
          </SubmitButton>
        </>
      ) : (
        <>
          <input type="hidden" name="email" value={estado?.email ?? ""} />
          {estado?.aviso ? <Alert tone="green">{estado.aviso}</Alert> : null}
          <Field label="Código de 6 dígitos">
            <Input name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus className="text-center text-lg tracking-[0.4em]" />
          </Field>
          <Field label="Senha nova" hint="Pelo menos 8 caracteres.">
            <InputSenha name="senha" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Repita a senha nova">
            <InputSenha name="confirmar" autoComplete="new-password" minLength={8} required />
          </Field>
          {estado?.erro ? <Alert>{estado.erro}</Alert> : null}
          <SubmitButton pending={pending} size="lg" pendingText="Salvando...">
            Salvar senha nova
          </SubmitButton>
          <button
            type="button"
            className="text-sm font-semibold text-gold hover:underline"
            onClick={(e) => {
              // Limpa código e senha e envia: a ação entende como "mande outro código".
              const f = e.currentTarget.form!;
              for (const n of ["codigo", "senha", "confirmar"]) {
                const el = f.elements.namedItem(n) as HTMLInputElement | null;
                if (el) el.value = "";
              }
              f.noValidate = true;
              f.requestSubmit();
              f.noValidate = false;
            }}
          >
            Não recebi: enviar outro código
          </button>
        </>
      )}
      <Link href="/login" className="text-center text-sm text-muted hover:text-foreground">
        Voltar para o login
      </Link>
    </form>
  );
}
