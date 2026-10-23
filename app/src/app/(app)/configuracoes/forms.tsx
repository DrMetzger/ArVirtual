"use client";

import { Loader2, Mail, Pencil, Plus, Search, Send, ShieldCheck, Sparkles, Trash2, UserPlus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { AddressFields, emptyAddress, type AddressValues } from "@/components/address-fields";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/ui/client";
import type { Empresa } from "@/db/schema";
import { formatCep, formatDocumento, formatTelefone, onlyDigits } from "@/lib/utils";
import {
  alterarSenha,
  criarUsuario,
  excluirContaEmail,
  excluirUsuario,
  reenviarCertificadoFocus,
  removerCertificado,
  salvarCertificado,
  salvarContaEmail,
  salvarEmpresa,
  salvarIntegracoes,
  testarContaEmail,
  testarGemini,
  type FormState,
} from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (state?.erro) return <Alert>{state.erro}</Alert>;
  if (state?.ok) return <Alert tone="green">{state.ok}</Alert>;
  return null;
}

// ---------- Empresa ----------
export function EmpresaForm({ empresa }: { empresa: Empresa | null }) {
  const [state, onSubmit, pending] = useFormAction(salvarEmpresa, null);
  const [cnpj, setCnpj] = useState(formatDocumento(empresa?.cnpj ?? ""));
  const [dados, setDados] = useState({
    razaoSocial: empresa?.razaoSocial ?? "",
    nomeFantasia: empresa?.nomeFantasia ?? "",
    inscricaoEstadual: empresa?.inscricaoEstadual ?? "",
    email: empresa?.email ?? "",
    telefone: formatTelefone(empresa?.telefone ?? ""),
  });
  const [endereco, setEndereco] = useState<AddressValues>(
    empresa?.cep ? { ...empresa, cep: formatCep(empresa.cep) } : emptyAddress,
  );
  const [busca, startBusca] = useTransition();
  const [erroBusca, setErroBusca] = useState("");

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card>
        <CardHeader title="Emitente" description="Dados que saem na NF-e. O CNPJ precisa ser o mesmo cadastrado na Focus NFe." />
        <div className="grid gap-4 p-5 sm:grid-cols-6">
          <Field label="CNPJ" className="sm:col-span-2" error={erroBusca}>
            <div className="flex gap-2">
              <Input name="cnpj" value={cnpj} onChange={(e) => setCnpj(formatDocumento(onlyDigits(e.target.value).slice(0, 14)))} required />
              <Button
                type="button"
                variant="gold"
                size="icon"
                title="Buscar na Receita"
                disabled={busca || onlyDigits(cnpj).length !== 14}
                onClick={() =>
                  startBusca(async () => {
                    setErroBusca("");
                    const res = await fetch(`/api/documento/${onlyDigits(cnpj)}`);
                    const r = await res.json();
                    if (!res.ok) return setErroBusca(r.erro);
                    setDados({
                      razaoSocial: r.nome,
                      nomeFantasia: r.nomeFantasia,
                      inscricaoEstadual: r.inscricaoEstadual || dados.inscricaoEstadual,
                      email: r.email || dados.email,
                      telefone: formatTelefone(r.telefone) || dados.telefone,
                    });
                    if (r.endereco) setEndereco({ ...r.endereco, cep: formatCep(r.endereco.cep) });
                  })
                }
              >
                {busca ? <Loader2 className="animate-spin" /> : <Search />}
              </Button>
            </div>
          </Field>
          <Field label="Razão social" className="sm:col-span-4">
            <Input name="razaoSocial" value={dados.razaoSocial} onChange={(e) => setDados({ ...dados, razaoSocial: e.target.value })} required />
          </Field>
          <Field label="Nome fantasia" className="sm:col-span-2">
            <Input name="nomeFantasia" value={dados.nomeFantasia} onChange={(e) => setDados({ ...dados, nomeFantasia: e.target.value })} />
          </Field>
          <Field label="Inscrição estadual" className="sm:col-span-2">
            <Input
              name="inscricaoEstadual"
              value={dados.inscricaoEstadual}
              onChange={(e) => setDados({ ...dados, inscricaoEstadual: e.target.value })}
            />
          </Field>
          <Field label="Inscrição municipal" className="sm:col-span-2">
            <Input name="inscricaoMunicipal" defaultValue={empresa?.inscricaoMunicipal} />
          </Field>
          <Field label="Regime tributário (CRT)" className="sm:col-span-2">
            <Select name="regime" defaultValue={empresa?.regime ?? 1}>
              <option value={1}>1 · Simples Nacional</option>
              <option value={4}>4 · MEI</option>
              <option value={2}>2 · Simples (excesso de sublimite)</option>
              <option value={3}>3 · Regime Normal</option>
            </Select>
          </Field>
          <Field label="Telefone" className="sm:col-span-2">
            <Input name="telefone" value={dados.telefone} onChange={(e) => setDados({ ...dados, telefone: formatTelefone(onlyDigits(e.target.value).slice(0, 11)) })} />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <Input name="email" type="email" value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Endereço do emitente" />
        <div className="p-5">
          <AddressFields value={endereco} onChange={setEndereco} showApelido={false} />
        </div>
      </Card>
      <Feedback state={state} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="Salvando...">Salvar empresa</SubmitButton>
      </div>
    </form>
  );
}

// ---------- Integrações ----------
type SettingItem = {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  options?: string[];
  value: string;
  isSet: boolean;
};

export function IntegracaoForm({ grupo, itens, ajuda }: { grupo: string; itens: SettingItem[]; ajuda?: React.ReactNode }) {
  const [state, onSubmit, pending] = useFormAction(salvarIntegracoes, null);
  const [teste, setTeste] = useState<FormState>(null);
  const [testando, startTeste] = useTransition();
  const temSegredo = itens.some((i) => i.secret);
  const configurado = itens.filter((i) => i.secret).every((i) => i.isSet) && itens.some((i) => i.isSet);
  const badge = configurado ? "Configurado" : temSegredo ? "Pendente" : "Usando padrões";

  return (
    <Card>
      <CardHeader
        title={grupo}
        description={ajuda}
        action={<Badge tone={configurado ? "green" : "neutral"}>{badge}</Badge>}
      />
      <form onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        <input type="hidden" name="grupo" value={grupo} />
        {itens.map((i) => (
          <Field
            key={i.key}
            label={i.label}
            hint={
              i.secret && i.isSet ? (
                <span className="flex items-center gap-3">
                  Salvo ({i.value}). Deixe vazio para manter.
                  <label className="flex items-center gap-1 text-red">
                    <input type="checkbox" name={`${i.key}__limpar`} className="accent-[var(--red)]" /> remover
                  </label>
                </span>
              ) : undefined
            }
          >
            {i.options ? (
              <Select name={i.key} defaultValue={i.value || i.options[0]}>
                {i.options.map((o) => (
                  <option key={o} value={o}>
                    {o === "producao" ? "Produção" : o === "homologacao" ? "Homologação (testes)" : "Sandbox (testes)"}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                name={i.key}
                type={i.secret ? "password" : "text"}
                autoComplete="off"
                defaultValue={i.secret ? "" : i.value}
                placeholder={i.secret && i.isSet ? "••••••••" : i.placeholder}
              />
            )}
          </Field>
        ))}
        <div className="grid gap-3 sm:col-span-2">
          <Feedback state={state} />
          <Feedback state={teste} />
          <div className="flex justify-end gap-2">
            {grupo.startsWith("IA") ? (
              <Button type="button" variant="outline" disabled={testando} onClick={() => startTeste(async () => setTeste(await testarGemini()))}>
                {testando ? <Loader2 className="animate-spin" /> : <Sparkles />} Testar
              </Button>
            ) : null}
            <SubmitButton pending={pending} pendingText="Salvando...">Salvar</SubmitButton>
          </div>
        </div>
      </form>
    </Card>
  );
}

// ---------- E-mails ----------
type Conta = {
  id: number;
  nome: string;
  host: string;
  porta: number;
  seguro: boolean;
  usuario: string;
  remetenteNome: string;
  remetenteEmail: string;
  padrao: boolean;
};

function ContaEmailForm({ conta, onDone }: { conta?: Conta; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(async (p: FormState, f: FormData) => {
    const r = await salvarContaEmail(p, f);
    if (r?.ok) onDone();
    return r;
  }, null);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-gold/40 bg-surface-2 p-4 sm:grid-cols-6">
      {conta ? <input type="hidden" name="id" value={conta.id} /> : null}
      <Field label="Nome da conta" className="sm:col-span-2">
        <Input name="nome" defaultValue={conta?.nome} placeholder="Comercial" required />
      </Field>
      <Field label="Servidor SMTP" className="sm:col-span-3">
        <Input name="host" defaultValue={conta?.host} placeholder="smtp.arvirtual.com.br" required />
      </Field>
      <Field label="Porta" className="sm:col-span-1">
        <Input name="porta" type="number" defaultValue={conta?.porta ?? 587} required />
      </Field>
      <Field label="Usuário" className="sm:col-span-3">
        <Input name="usuario" defaultValue={conta?.usuario} autoComplete="off" required />
      </Field>
      <Field label="Senha" className="sm:col-span-3" hint={conta ? "Deixe vazio para manter a atual" : undefined}>
        <Input name="senha" type="password" autoComplete="new-password" required={!conta} />
      </Field>
      <Field label="Nome do remetente" className="sm:col-span-3">
        <Input name="remetenteNome" defaultValue={conta?.remetenteNome ?? "ArVirtual"} required />
      </Field>
      <Field label="E-mail do remetente" className="sm:col-span-3">
        <Input name="remetenteEmail" type="email" defaultValue={conta?.remetenteEmail} required />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="seguro" defaultChecked={conta?.seguro ?? false} className="accent-[var(--gold)]" />
        SSL direto (porta 465). Desmarcado usa STARTTLS (587).
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="padrao" defaultChecked={conta?.padrao ?? false} className="accent-[var(--gold)]" />
        Conta padrão para envio de notas
      </label>
      <div className="grid gap-3 sm:col-span-6">
        <Feedback state={state} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <SubmitButton pending={pending} pendingText="Salvando...">Salvar conta</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function ContasEmail({ contas }: { contas: Conta[] }) {
  const [editando, setEditando] = useState<number | "nova" | null>(null);
  const [msg, setMsg] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader
        title="Contas de e-mail (SMTP)"
        description="Usadas para enviar notas fiscais e avisos aos clientes."
        action={
          <Button variant="outline" size="sm" onClick={() => setEditando("nova")}>
            <Plus /> Nova conta
          </Button>
        }
      />
      <div className="grid gap-3 p-5">
        {editando === "nova" ? <ContaEmailForm onDone={() => setEditando(null)} /> : null}
        {contas.length === 0 && editando !== "nova" ? <p className="text-sm text-muted">Nenhuma conta cadastrada.</p> : null}
        {contas.map((c) =>
          editando === c.id ? (
            <ContaEmailForm key={c.id} conta={c} onDone={() => setEditando(null)} />
          ) : (
            <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="grid size-10 place-items-center rounded-xl bg-surface-2 text-gold">
                <Mail className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.nome} {c.padrao ? <Badge tone="gold">Padrão</Badge> : null}
                </p>
                <p className="text-xs text-muted">
                  {c.remetenteNome} &lt;{c.remetenteEmail}&gt; · {c.host}:{c.porta}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => setMsg(await testarContaEmail(c.id)))}>
                <Send /> Testar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditando(c.id)} title="Editar">
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hover:text-red"
                title="Excluir"
                onClick={() => confirm(`Excluir a conta "${c.nome}"?`) && start(() => excluirContaEmail(c.id))}
              >
                <Trash2 />
              </Button>
            </div>
          ),
        )}
        <Feedback state={msg} />
      </div>
    </Card>
  );
}

// ---------- Usuários ----------
export function Usuarios({
  usuarios,
  meuId,
  admin,
}: {
  usuarios: { id: string; nome: string; email: string; papel: "admin" | "usuario" }[];
  meuId: string;
  admin: boolean;
}) {
  const [state, action] = useActionState(criarUsuario, null);
  const [senhaState, senhaAction] = useActionState(alterarSenha, null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Usuários" description="Quem pode acessar o sistema." />
        <div className="grid divide-y divide-border">
          {usuarios.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.nome} {u.id === meuId ? <span className="text-xs text-muted">(você)</span> : null}
                </p>
                <p className="text-xs text-muted">{u.email}</p>
              </div>
              <Badge tone={u.papel === "admin" ? "gold" : "neutral"}>{u.papel}</Badge>
              {admin && u.id !== meuId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:text-red"
                  disabled={pending}
                  onClick={() => confirm(`Remover o acesso de ${u.nome}?`) && start(() => excluirUsuario(u.id))}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {admin ? (
          <form action={action} className="grid gap-3 border-t border-border p-5 sm:grid-cols-2">
            <Field label="Nome">
              <Input name="nome" required />
            </Field>
            <Field label="E-mail">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Senha inicial">
              <Input name="senha" type="password" minLength={10} autoComplete="new-password" required />
            </Field>
            <Field label="Perfil">
              <Select name="papel" defaultValue="usuario">
                <option value="usuario">Usuário</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:col-span-2">
              <Feedback state={state} />
              <SubmitButton variant="outline" pendingText="Criando...">
                <UserPlus /> Adicionar usuário
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </Card>
      <Card>
        <CardHeader title="Minha senha" />
        <form action={senhaAction} className="grid gap-3 p-5">
          <Field label="Senha atual">
            <Input name="atual" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="Nova senha" hint="Mínimo de 10 caracteres">
            <Input name="nova" type="password" minLength={10} autoComplete="new-password" required />
          </Field>
          <Feedback state={senhaState} />
          <SubmitButton pendingText="Alterando...">Alterar senha</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

// ---------- Certificado digital A1 ----------
type CertInfo = {
  titular: string;
  cnpj: string;
  nomeArquivo: string;
  validoDe: string;
  validoAte: string;
  dias: number;
  enviadoFocusEm: string | null;
  mensagemFocus: string;
};

export function CertificadoA1({ cert, cnpjEmpresa }: { cert: CertInfo | null; cnpjEmpresa: string }) {
  const [state, onSubmit, pending] = useFormAction(salvarCertificado, null);
  const [reenvio, setReenvio] = useState<FormState>(null);
  const [ocupado, start] = useTransition();
  const tom = !cert ? "neutral" : cert.dias < 0 ? "red" : cert.dias <= 30 ? "gold" : "green";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Certificado digital A1"
          description="Usado para assinar as NF-e. Fica criptografado no sistema e é enviado à Focus NFe."
          action={
            <Badge tone={tom}>
              {!cert ? "Não cadastrado" : cert.dias < 0 ? "Vencido" : cert.dias <= 30 ? `Vence em ${cert.dias} dias` : "Válido"}
            </Badge>
          }
        />
        {cert ? (
          <div className="grid gap-4 p-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-gold">
                <ShieldCheck className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{cert.titular || "Titular não identificado"}</p>
                <p className="text-muted">CNPJ {cert.cnpj ? formatDocumento(cert.cnpj) : "—"}</p>
                <p className="text-xs text-muted">{cert.nomeArquivo}</p>
              </div>
            </div>
            {cnpjEmpresa && cert.cnpj && cnpjEmpresa !== cert.cnpj ? (
              <Alert>O CNPJ do certificado é diferente do CNPJ da empresa ({formatDocumento(cnpjEmpresa)}). A SEFAZ vai rejeitar as notas.</Alert>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Válido desde</p>
                <p className="font-semibold">{cert.validoDe}</p>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Válido até</p>
                <p className={`font-semibold ${cert.dias <= 30 ? "text-red" : ""}`}>{cert.validoAte}</p>
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Focus NFe</p>
              <p className={cert.enviadoFocusEm ? "text-green" : "text-red"}>
                {cert.enviadoFocusEm ? `Enviado em ${cert.enviadoFocusEm}. ` : "Ainda não enviado. "}
                {cert.mensagemFocus}
              </p>
            </div>
            <Feedback state={reenvio} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                className="hover:text-red"
                disabled={ocupado}
                onClick={() => confirm("Remover o certificado do sistema?") && start(() => removerCertificado())}
              >
                <Trash2 /> Remover
              </Button>
              <Button variant="outline" disabled={ocupado} onClick={() => start(async () => setReenvio(await reenviarCertificadoFocus()))}>
                {ocupado ? <Loader2 className="animate-spin" /> : <Send />} Reenviar à Focus
              </Button>
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">Nenhum certificado cadastrado. Envie o arquivo .pfx ao lado.</p>
        )}
      </Card>

      <Card>
        <CardHeader title={cert ? "Trocar certificado" : "Enviar certificado"} description="Arquivo .pfx ou .p12 (modelo A1) e a senha dele." />
        <form onSubmit={onSubmit} className="grid gap-4 p-5">
          <Field label="Arquivo do certificado">
            <Input name="arquivo" type="file" accept=".pfx,.p12,application/x-pkcs12" required className="py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm" />
          </Field>
          <Field label="Senha do certificado">
            <Input name="senha" type="password" autoComplete="off" required />
          </Field>
          {state?.ok ? <Alert tone="green">{state.ok}</Alert> : null}
          {state?.erro ? <Alert>{state.erro}</Alert> : null}
          <SubmitButton pending={pending} pendingText="Validando...">
            <ShieldCheck /> Salvar certificado
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
