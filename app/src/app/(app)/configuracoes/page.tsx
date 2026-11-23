import { listaImpressoras, MODELOS_IMPRESSORA } from "@/lib/impressoras";
import { Impressoras } from "./impressoras";
import { ContaBambu } from "./bambu";
import { contaBambu } from "@/lib/bambu-conta";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Alert, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { contasEmail, usuarios } from "@/db/schema";
import { usoApicpf } from "@/lib/apicpf";
import { FAIXAS_PADRAO, FAIXAS_PREMIUM_ML } from "@/lib/precificacao";
import { requireUser } from "@/lib/auth";
import { callbackUrl } from "@/lib/marketplaces";
import { abaDoGrupo, getSetting, getSettingsForDisplay } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { diasParaVencer } from "@/lib/fiscal/certificado";
import { MagaluGuia } from "./magalu-guia";
import { AparelhosAba } from "./aparelhos-aba";
import { CertificadoA1, ContasEmail, EmpresaForm, IntegracaoForm, Usuarios } from "./forms";

export const metadata: Metadata = { title: "Configurações" };

const ABAS = [
  { id: "empresa", label: "Empresa" },
  { id: "certificado", label: "Certificado A1 e NF-e" },
  { id: "integracoes", label: "Integrações e APIs" },
  { id: "impressora", label: "Impressora 3D" },
  { id: "precificacao", label: "Precificação" },
  { id: "emails", label: "E-mails" },
  { id: "usuarios", label: "Usuários" },
  { id: "aparelhos", label: "Aparelhos" },
] as const;

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; teste?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const abaParam = sp.aba;
  const aba = ABAS.some((a) => a.id === abaParam) ? abaParam : "empresa";
  const admin = me.papel === "admin";
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const [usoCpf, apicpfReserva] = await Promise.all([usoApicpf(), getSetting("apicpf.chave").then((c) => !c && Boolean(process.env.APICPF_CHAVE))]);

  const AJUDA: Record<string, React.ReactNode> = {
    "IA (Google Gemini)": "Gere a chave em aistudio.google.com › Get API key. Gerar imagens pode exigir faturamento ativo no Google AI Studio (o plano gratuito costuma não ter cota para imagens).",
    Fiscal: "Parâmetros do cálculo de impostos (a matriz fica em Matriz fiscal).",
    Segurança: "Com \"sim\", todos recebem um código por e-mail ao entrar. Precisa de uma conta de e-mail padrão (aba E-mails).",
    "Consulta de CPF (APICPF)": (
      <>
        Chave em apicpf.com › Minhas Chaves API. Cada CPF é consultado uma vez só (depois vem do cache). Hoje: {usoCpf.dia}/{usoCpf.limiteDia} consultas
        {usoCpf.creditos !== null ? ` · ${usoCpf.creditos} crédito(s) da base externa` : ""}
        {apicpfReserva ? " · usando a chave do servidor (segredo APICPF_CHAVE)" : ""}.
      </>
    ),
    Sketchfab: "Opcional: a pesquisa e as fotos do Sketchfab funcionam sem chave. O token grátis (sketchfab.com › Settings › Password & API) deixa o ERP baixar o arquivo original do modelo para o produto.",
    Thingiverse: "Para a pesquisa de modelos 3D e o download dos arquivos do Thingiverse. Cole aqui o App Token (thingiverse.com › Apps › seu app › App Token).",
    MyMiniFactory: "Opcional: para a pesquisa de modelos 3D incluir o MyMiniFactory. Crie a chave na sua conta do site (área de desenvolvedor).",
    Cults: "Para a pesquisa de modelos 3D incluir o Cults3D. Use o apelido (API user) e a chave da API (cults3d.com › Configurações › API keys).",
    "Mercado Livre": <>Redirect URI: <code className="break-all">{callbackUrl(origin, "mercadolivre")}</code></>,
    "Shopee · preços da concorrência": (
      <>
        Só para pesquisar os preços e as vendas dos concorrentes na Shopee (Modelos 3D, preço de mercado e Sentinela). É a chave da Open API de afiliados
        (affiliate.shopee.com.br); o ERP não usa mais a parte de afiliados.
      </>
    ),
    "Notificações no celular (Firebase)": (
      <>
        Aviso de pedido novo na hora no app (push, grátis). Em console.firebase.google.com: crie um projeto, adicione um app Android com o pacote{" "}
        <code>br.com.arvirtual.app</code> e baixe o <strong>google-services.json</strong>; depois em Configurações do projeto › Contas de serviço › Gerar nova chave
        privada. Cole os dois arquivos aqui. Os celulares se registram sozinhos ao abrir o app.
      </>
    ),
    "Conversor de vídeo": (
      <>
        TikTok, YouTube e Shopee baixam sem login. Instagram, Facebook e Threads muitas vezes exigem login: no computador, entre na rede social no Chrome, exporte os
        cookies com a extensão “Get cookies.txt LOCALLY” e cole o conteúdo aqui. Use uma conta secundária (o arquivo dá acesso à conta).
      </>
    ),
    Shopee: <>Redirect URL: <code className="break-all">{callbackUrl(origin, "shopee")}</code></>,
    Magalu: <MagaluGuia base={process.env.APP_URL ?? origin} clientId={(await getSetting("magalu.clientId")) ?? ""} />,
    "Impressão 3D: custos": "Usado no cálculo do custo de produção dos produtos.",
    "Impressora 3D": "O assistente de IA usa estes dados para dar dicas de impressão (temperaturas, perfis, mesa, AMS) da sua máquina.",
    "Precificação: geral": "Vale para todos os canais. O preço sugerido de cada canal é o que deixa este lucro depois de taxas, campanha, imposto e embalagem.",
    "Precificação: Mercado Livre": (
      <>
        Formato: <code>limite:comissão%+taxa</code> separados por “;” (o limite é o preço de venda; “*” = acima). Padrão do Clássico: <code>{FAIXAS_PADRAO.mercadolivre}</code>; Premium:{" "}
        <code>{FAIXAS_PREMIUM_ML}</code>. Confira na central do vendedor: a comissão muda por categoria. Frete grátis: em “Sua parte do frete” informe o que você paga
        por venda (ex.: 50% do frete com o desconto da sua reputação).
      </>
    ),
    "Precificação: Shopee": (
      <>
        Tabela da Shopee desde 01/10/2026 (padrão): <code>{FAIXAS_PADRAO.shopee}</code>.
      </>
    ),
    "Precificação: Magalu": (
      <>
        Padrão: <code>{FAIXAS_PADRAO.magalu}</code>. Confira a comissão da sua categoria no Portal do Seller.
      </>
    ),
    "Precificação: loja própria (Sincrolab)": "Taxas do meio de pagamento da loja própria (ex.: *:4.99% para cartão). Sem campanha.",
  };

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, chaves de API, contas de e-mail e acessos." />
      <nav className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1">
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

      {aba === "impressora" ? <Impressoras lista={await listaImpressoras(false)} modelos={MODELOS_IMPRESSORA} /> : null}

      {aba === "integracoes" ? (
        <div className="mb-6">
          <ContaBambu conta={await contaBambu()} />
        </div>
      ) : null}

      {aba === "integracoes" || aba === "precificacao" || aba === "impressora" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {Object.entries(
            (await getSettingsForDisplay()).filter((s) => abaDoGrupo(s.group) === aba && s.group !== "Conta Bambu Lab (MakerWorld)").reduce<Record<string, Awaited<ReturnType<typeof getSettingsForDisplay>>>>((acc, s) => {
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

      {aba === "aparelhos" ? <AparelhosAba admin={admin} teste={sp.teste} /> : null}

      {aba === "usuarios" ? (
        <UsuariosAba meuId={me.sub} admin={admin} />
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
      emissao={{
        ambienteNfe: emp?.ambienteNfe ?? "homologacao",
        serieNfe: emp?.serieNfe ?? 1,
        proximoNumeroNfe: emp?.proximoNumeroNfe ?? 1,
        aliquotaCreditoSn: emp?.aliquotaCreditoSn ?? null,
        regime: emp?.regime ?? 1,
      }}
      cert={
        cert
          ? {
              titular: cert.titular,
              cnpj: cert.cnpj,
              nomeArquivo: cert.nomeArquivo,
              validoDe: data(cert.validoDe),
              validoAte: data(cert.validoAte),
              dias: diasParaVencer(cert.validoAte),
            }
          : null
      }
    />
  );
}

async function UsuariosAba({ meuId, admin }: { meuId: string; admin: boolean }) {
  const [lista, exigido] = await Promise.all([
    db
      .select({ id: usuarios.id, nome: usuarios.nome, email: usuarios.email, papel: usuarios.papel, doisFatores: usuarios.doisFatores })
      .from(usuarios)
      .orderBy(asc(usuarios.nome)),
    getSetting("seguranca.exigir2fa"),
  ]);
  return (
    <Usuarios
      meuId={meuId}
      admin={admin}
      usuarios={lista}
      meu2fa={lista.find((u) => u.id === meuId)?.doisFatores ?? false}
      exigido2fa={exigido === "sim"}
    />
  );
}
