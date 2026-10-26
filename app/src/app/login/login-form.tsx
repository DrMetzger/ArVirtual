"use client";

import { Alert, Field, Input } from "@/components/ui";
import { InputSenha, SubmitButton, useFormAction } from "@/components/ui/client";
import { login } from "./actions";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, onSubmit, pending] = useFormAction(login, null);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Senha">
        <InputSenha name="senha" autoComplete="current-password" required />
      </Field>
      {state?.erro ? <Alert>{state.erro}</Alert> : null}
      <SubmitButton pending={pending} size="lg" pendingText="Entrando...">
        Entrar
      </SubmitButton>
    </form>
  );
}
