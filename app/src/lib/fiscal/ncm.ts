import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ncms } from "@/db/schema";
import { gerarComGemini, geminiConfigurado } from "@/lib/gemini";

// Cadastro automático de NCM, como no ERP Vanguard: o produto salvo com NCM novo cria o registro como
// "descrição pendente" e o Gemini completa a descrição oficial (TIPI) e o IPI.

const MAX_DESCRICAO = 250;
export const descricaoPendente = (codigo: string) => `NCM ${codigo} (descrição pendente)`;

type InfoNcm = { descricao: string; ipi: number | null };

/** Valida o que veio da IA: mesmo código, descrição não vazia, IPI entre 0 e 400%. */
function lerResposta(codigo: string, bruto: unknown): InfoNcm | null {
  const a = (Array.isArray(bruto) ? bruto[0] : bruto) as Record<string, unknown> | null;
  if (!a || typeof a !== "object" || a.exists === false) return null;
  if (a.code !== undefined && String(a.code).replace(/\D/g, "") !== codigo) return null;
  const descricao = String(a.description ?? "").replace(/\s+/g, " ").replace(/^[-–\s]+/, "").trim();
  if (descricao.length < 3) return null;
  const ipi = a.ipiRate === null || a.ipiRate === undefined || a.ipiRate === "" ? null : Number(String(a.ipiRate).replace(",", ".").replace("%", ""));
  return {
    descricao: descricao.length > MAX_DESCRICAO ? `${descricao.slice(0, MAX_DESCRICAO - 1)}…` : descricao,
    ipi: ipi !== null && Number.isFinite(ipi) && ipi >= 0 && ipi <= 400 ? Math.round(ipi * 100) / 100 : null,
  };
}

export async function descreverNcm(codigo: string): Promise<InfoNcm | null> {
  if (!/^\d{8}$/.test(codigo)) return null;
  const prompt = `Você é um especialista em classificação fiscal brasileira.
Informe a descrição oficial do NCM ${codigo} conforme a Nomenclatura Comum do Mercosul / TIPI vigente
(texto do item/subitem, em português, sem o código) e a alíquota de IPI da TIPI se souber (null se não souber).
Se o código não existir na nomenclatura, responda {"exists": false}.
Responda somente com JSON: {"exists": true, "code": "${codigo}", "description": "…", "ipiRate": number|null}`;
  return lerResposta(codigo, JSON.parse(await gerarComGemini([{ role: "user", text: prompt }], { json: true, temperature: 0 })));
}

/** Completa com a IA um NCM pendente. Devolve se conseguiu. */
export async function completarNcm(codigo: string): Promise<{ ok: boolean; motivo?: string }> {
  if (!(await geminiConfigurado())) return { ok: false, motivo: "Gemini não configurado (Configurações › Integrações)" };
  let info: InfoNcm | null;
  try {
    info = await descreverNcm(codigo);
  } catch (e) {
    return { ok: false, motivo: (e as Error).message };
  }
  if (!info) return { ok: false, motivo: "A IA não reconheceu este NCM" };
  const atual = await db.query.ncms.findFirst({ where: eq(ncms.codigo, codigo) });
  await db
    .update(ncms)
    .set({ descricao: info.descricao, aliquotaIpi: atual?.aliquotaIpi ?? info.ipi, pendente: false, fonte: "ia" })
    .where(and(eq(ncms.codigo, codigo), eq(ncms.pendente, true)));
  return { ok: true };
}

/** Garante o NCM no cadastro; novo entra pendente e a IA completa. Nunca lança erro. */
export async function garantirNcm(codigo: string | null | undefined) {
  try {
    if (!codigo || !/^\d{8}$/.test(codigo)) return;
    const [criado] = await db
      .insert(ncms)
      .values({ codigo, descricao: descricaoPendente(codigo) })
      .onConflictDoNothing()
      .returning({ codigo: ncms.codigo });
    if (criado) await completarNcm(codigo);
  } catch (e) {
    console.error(`Falha ao cadastrar o NCM ${codigo}: ${(e as Error).message}`);
  }
}

export type SugestaoNcm = { ncm: string; descricao: string; justificativa: string };

/** Sugere o NCM pelo nome/descrição do produto (o usuário confirma). */
export async function sugerirNcm(produto: { nome: string; descricao: string; material: string }): Promise<SugestaoNcm[]> {
  const prompt = `Você é um especialista em classificação fiscal brasileira (NCM/TIPI).
Sugira até 3 NCMs de 8 dígitos para o produto abaixo, do mais provável ao menos provável.
Produto: ${produto.nome}
Descrição: ${produto.descricao || "(sem descrição)"}
Material: ${produto.material || "não informado"} (peça fabricada por impressão 3D)
Responda somente com JSON: [{"ncm": "8 dígitos", "descricao": "descrição oficial do NCM", "justificativa": "frase curta"}]`;
  const bruto = JSON.parse(await gerarComGemini([{ role: "user", text: prompt }], { json: true, temperature: 0.2 }));
  const lista = (Array.isArray(bruto) ? bruto : (Object.values(bruto ?? {}).find(Array.isArray) as unknown[]) ?? []) as Record<string, unknown>[];
  return lista
    .map((x) => ({ ncm: String(x.ncm ?? "").replace(/\D/g, ""), descricao: String(x.descricao ?? ""), justificativa: String(x.justificativa ?? "") }))
    .filter((x) => /^\d{8}$/.test(x.ncm))
    .slice(0, 3);
}
