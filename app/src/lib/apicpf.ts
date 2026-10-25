import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { consultasCpf } from "@/db/schema";
import { getSettings } from "./settings";

// APICPF (apicpf.com): nome, gênero e nascimento pelo CPF. O plano gratuito tem limite por dia e por
// minuto; o sistema conta cada chamada no banco e não deixa passar do limite configurado.
// Cada CPF é consultado uma vez só: depois vem do cache (sem gastar consulta).

const BASE = process.env.APICPF_URL || "https://apicpf.com/api/consulta";
const CACHE_ENCONTRADO_DIAS = 365;
const CACHE_NAO_ENCONTRADO_DIAS = 7;

export type PessoaCpf = { cpf: string; nome: string; genero: string; dataNascimento: string };

async function configuracao() {
  const s = await getSettings(["apicpf.chave", "apicpf.limiteDia", "apicpf.limiteMinuto"]);
  return {
    // A chave da tela de Configurações vale; APICPF_CHAVE (segredo do GitHub, no .env da VM) é a reserva.
    chave: s["apicpf.chave"] || process.env.APICPF_CHAVE || "",
    limiteDia: Math.max(0, Number(s["apicpf.limiteDia"]) || 100),
    limiteMinuto: Math.max(0, Number(s["apicpf.limiteMinuto"]) || 6),
  };
}

/** Meia-noite de hoje no horário de Brasília (o limite diário do plano vira à meia-noite). */
function inicioDoDia() {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${hoje}T00:00:00-03:00`);
}

export async function apicpfConfigurada() {
  return Boolean((await configuracao()).chave);
}

/** Consultas feitas hoje e no último minuto (para mostrar em Configurações). */
export async function usoApicpf() {
  const { limiteDia, limiteMinuto } = await configuracao();
  const [dia, minuto] = await Promise.all([
    db.$count(consultasCpf, gte(consultasCpf.criadoEm, inicioDoDia())),
    db.$count(consultasCpf, gte(consultasCpf.criadoEm, new Date(Date.now() - 60_000))),
  ]);
  const ultima = await db.query.consultasCpf.findFirst({
    where: sql`${consultasCpf.resposta} ? 'creditos'`,
    orderBy: desc(consultasCpf.criadoEm),
  });
  const creditos = (ultima?.resposta as { creditos?: number } | null)?.creditos ?? null;
  return { dia, minuto, limiteDia, limiteMinuto, creditos };
}

function pessoa(resposta: unknown): PessoaCpf | null {
  const d = (resposta as { data?: { cpf?: string; nome?: string; genero?: string; data_nascimento?: string } })?.data;
  return d?.nome ? { cpf: d.cpf ?? "", nome: d.nome, genero: d.genero ?? "", dataNascimento: d.data_nascimento ?? "" } : null;
}

/** Busca o CPF (já validado). Devolve null se a APICPF não conhece o CPF. */
export async function consultarApicpf(cpf: string): Promise<PessoaCpf | null> {
  const cfg = await configuracao();
  if (!cfg.chave) throw new Error("CPF válido. Para buscar o nome, cadastre a chave da APICPF em Configurações › Integrações.");

  // 1. Cache: CPF já consultado não gasta consulta do plano.
  const anterior = await db.query.consultasCpf.findFirst({
    where: and(eq(consultasCpf.cpf, cpf), inArray(consultasCpf.status, [200, 404])),
    orderBy: desc(consultasCpf.criadoEm),
  });
  if (anterior) {
    const dias = (Date.now() - anterior.criadoEm.getTime()) / 86400_000;
    if (anterior.status === 200 && dias < CACHE_ENCONTRADO_DIAS) return pessoa(anterior.resposta);
    if (anterior.status === 404 && dias < CACHE_NAO_ENCONTRADO_DIAS) return null;
  }

  // 2. Reserva a consulta dentro dos limites. O lock evita que duas buscas simultâneas passem do limite.
  const reserva = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('apicpf'))`);
    const [dia, minuto] = await Promise.all([
      tx.$count(consultasCpf, gte(consultasCpf.criadoEm, inicioDoDia())),
      tx.$count(consultasCpf, gte(consultasCpf.criadoEm, new Date(Date.now() - 60_000))),
    ]);
    if (dia >= cfg.limiteDia) throw new Error(`Limite diário da consulta de CPF atingido (${cfg.limiteDia} por dia). Volta amanhã; preencha o nome à mão.`);
    if (minuto >= cfg.limiteMinuto) throw new Error(`Muitas consultas de CPF neste minuto (limite ${cfg.limiteMinuto}). Aguarde alguns segundos e tente de novo.`);
    const [r] = await tx.insert(consultasCpf).values({ cpf }).returning({ id: consultasCpf.id });
    return r!.id;
  });

  // 3. Consulta. A reserva continua contando no limite mesmo se der erro (a APICPF também conta).
  let status = 0;
  let corpo: { code?: number; message?: string; data?: unknown } = {};
  try {
    const res = await fetch(`${BASE}?cpf=${cpf}`, { headers: { "X-API-KEY": cfg.chave }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    status = res.status;
    corpo = await res.json().catch(() => ({}));
    // Saldo de créditos da base externa, mostrado em Configurações.
    const creditos = res.headers.get("x-credits-remaining");
    if (creditos !== null) Object.assign(corpo, { creditos: Number(creditos) });
  } catch (e) {
    await db.update(consultasCpf).set({ status: -1, resposta: { erro: (e as Error).message } }).where(eq(consultasCpf.id, reserva));
    throw new Error("APICPF não respondeu. Tente de novo em instantes.");
  }
  await db.update(consultasCpf).set({ status, resposta: corpo }).where(eq(consultasCpf.id, reserva));

  if (status === 200) return pessoa(corpo);
  if (status === 404) return null;
  const msg = corpo.message ?? `erro ${status}`;
  if (status === 401 || status === 403) throw new Error(`APICPF recusou a chave: ${msg}. Confira em Configurações › Integrações.`);
  if (status === 402) throw new Error("CPF fora da base da APICPF e sem créditos para a base externa. Preencha o nome à mão.");
  if (status === 429) throw new Error(`APICPF: ${msg}`);
  throw new Error(`APICPF: ${msg}`);
}
