import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { contasEmail, usuarios } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { callbackUrl } from "@/lib/marketplaces";
import { getSettingsForDisplay } from "@/lib/settings";
import { cn, formatDate } from "@/lib/utils";
import { diasParaVencer } from "@/lib/fiscal/certificado";
import { CertificadoA1, ContasEmail, EmpresaForm, IntegracaoForm, Usuarios } from "./forms";

export const metadata: Metadata = { title: "Configurações" };

const ABAS = [
  { id: "empresa", label: "Empresa" },
  { id: "certificado", label: "Certificado A1" },
  { id: "integracoes", label: "Integrações e APIs" },
  { id: "emails", label: "E-mails" },
  { id: "usuarios", label: "Usuários" },
] as const;

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const me = await requireUser();
  const abaParam = (await searchParams).aba;
  const aba = ABAS.some((a) => a.id === abaParam) ? abaParam : "empresa";
  const admin = me.papel === "admin";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const AJUDA: Record<string, React.ReactNode> = {
    "IA (Google Gemini)": "Gere a chave em aistudio.google.com › Get API key.",
    "Emissão de NF-e (Focus NFe)": "Token em app.focusnfe.com.br. Use homologacao para testes e producao para valer.",
    "Consulta CPF (Serpro)": "Opcional e pago: loja.serpro.gov.br › Consulta CPF. Sem ele, o CPF é só validado.",
    "Mercado Livre": <>Redirect URI: <code className="break-all">{callbackUrl(origin, "mercadolivre")}</code></>,
    Shopee: <>Redirect URL: <code className="break-all">{callbackUrl(origin, "shopee")}</code></>,
    Magalu: <>Redirect URI: <code className="break-all">{callbackUrl(origin, "magalu")}</code></>,
    "Impressão 3D (Bambu Lab A1 mini)": "Usado no cálculo de custo e preço sugerido dos produtos.",
  };

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, chaves de API, contas de e-mail e acessos." />
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={`/configuracoes?aba=${a.id}`}
            className={cn(
              "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition",
              aba === a.id ? "bg-primary text-primary-fg" : "text-muted hover:text-foreground",
            )}
          >
            {a.label}
          </Link>
        ))}
      </nav>

      {!admin && aba !== "usuarios" ? <div className="mb-6"><Alert tone="gold">Somente administradores podem alterar estas configurações.</Alert></div> : null}

      {aba === "empresa" ? <EmpresaForm empresa={(await db.query.empresa.findFirst()) ?? null} /> : null}

      {aba === "certificado" ? await certificadoAba() : null}

      {aba === "integracoes" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {Object.entries(
            (await getSettingsForDisplay()).reduce<Record<string, Awaited<ReturnType<typeof getSettingsForDisplay>>>>((acc, s) => {
              (acc[s.group] ??= []).push(s);
              return acc;
            }, {}),
          ).map(([grupo, itens]) => (
            <IntegracaoForm key={grupo} grupo={grupo} itens={itens} ajuda={AJUDA[grupo]} />
          ))}
        </div>
      ) : null}

      {aba === "emails" ? (
        <ContasEmail
          contas={await db
            .select({
              id: contasEmail.id,
              nome: contasEmail.nome,
              host: contasEmail.host,
              porta: contasEmail.porta,
              seguro: contasEmail.seguro,
              usuario: contasEmail.usuario,
              remetenteNome: contasEmail.remetenteNome,
              remetenteEmail: contasEmail.remetenteEmail,
              padrao: contasEmail.padrao,
            })
            .from(contasEmail)
            .orderBy(asc(contasEmail.nome))}
        />
      ) : null}

      {aba === "usuarios" ? (
        <Usuarios
          meuId={me.sub}
          admin={admin}
          usuarios={await db
            .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: usuarios.papel })
            .from(usuarios)
            .orderBy(asc(usuarios.nome))}
        />
      ) : null}
    </>
  );
}

async function certificadoAba() {
  const [cert, emp] = await Promise.all([db.query.certificadoDigital.findFirst(), db.query.empresa.findFirst()]);
  const data = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
  return (
    <CertificadoA1
      cnpjEmpresa={emp?.cnpj ?? ""}
      cert={
        cert
          ? {
              titular: cert.titular,
              cnpj: cert.cnpj,
              nomeArquivo: cert.nomeArquivo,
              validoDe: data(cert.validoDe),
              validoAte: data(cert.validoAte),
              dias: diasParaVencer(cert.validoAte),
              enviadoFocusEm: cert.enviadoFocusEm ? formatDate(cert.enviadoFocusEm) : null,
              mensagemFocus: cert.mensagemFocus,
            }
          : null
      }
    />
  );
}
