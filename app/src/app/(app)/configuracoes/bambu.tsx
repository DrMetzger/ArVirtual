"use client";

import { LogIn } from "lucide-react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { InputSenha, SubmitButton, useFormAction } from "@/components/ui/client";
import { desconectarBambu, loginBambu } from "./bambu-actions";

/** Conta Bambu Lab: o MakerWorld só libera o 3MF com login. A senha não fica guardada (só a chave de acesso). */
export function ContaBambu({ conta }: { conta: { email: string; conectada: boolean; validade: string } }) {
  const [estado, onSubmit, pending] = useFormAction(loginBambu, null);
  const valida = conta.validade ? new Date(conta.validade).toLocaleDateString("pt-BR") : "";
  return (
    <Card>
      <CardHeader
        title="Conta Bambu Lab (MakerWorld)"
        description="Para o sistema baixar sozinho o 3MF dos modelos do MakerWorld para o cadastro do produto. Sua senha não fica guardada: só a chave de acesso que a Bambu devolve (criptografada)."
        action={<Badge tone={conta.conectada ? "green" : "neutral"}>{conta.conectada ? `Conectada${valida ? ` até ${valida}` : ""}` : "Não conectada"}</Badge>}
      />
      <form onSubmit={onSubmit} className="grid gap-3 p-5 sm:grid-cols-2">
        <Field label="E-mail da conta Bambu Lab">
          <Input name="email" type="email" required defaultValue={estado?.email ?? conta.email} />
        </Field>
        {estado?.codigo ? (
          <Field label="Código que chegou no e-mail">
            <Input name="codigo" inputMode="numeric" required autoFocus />
          </Field>
        ) : (
          <Field label="Senha da Bambu Lab">
            <InputSenha name="senha" required autoComplete="off" />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <SubmitButton pending={pending} pendingText="Entrando...">
            <LogIn /> {estado?.codigo ? "Confirmar código" : conta.conectada ? "Conectar de novo" : "Conectar"}
          </SubmitButton>
          {conta.conectada ? (
            <Button type="button" variant="ghost" onClick={() => desconectarBambu()}>
              Desconectar
            </Button>
          ) : null}
        </div>
        {estado?.erro ? (
          <div className="sm:col-span-2">
            <Alert>{estado.erro}</Alert>
          </div>
        ) : estado?.ok ? (
          <p className="text-sm text-green sm:col-span-2">{estado.ok}</p>
        ) : null}
      </form>
    </Card>
  );
}
