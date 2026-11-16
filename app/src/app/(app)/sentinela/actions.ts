"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sentinelaRelatorios, sentinelaTermos } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { buscarModelos } from "@/lib/modelos3d";
import { analisarComIa, coletarSentinela, estruturarPlano, gerarRelatorio } from "@/lib/sentinela";

const voltar = (caminho: string, tipo: "ok" | "erro", msg: string): never => redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}${tipo}=${encodeURIComponent(msg)}`);

// Coleta e relatório levam minutos: rodam em segundo plano e a tela mostra o andamento.
const estado = globalThis as unknown as { sentinelaTrabalho?: { tipo: string; desde: number } | null };
export async function trabalhoEmAndamento() {
  const t = estado.sentinelaTrabalho;
  return t && Date.now() - t.desde < 20 * 60_000 ? t : null;
}
function emSegundoPlano(tipo: string, fn: () => Promise<unknown>) {
  if (estado.sentinelaTrabalho && Date.now() - estado.sentinelaTrabalho.desde < 20 * 60_000) return false;
  estado.sentinelaTrabalho = { tipo, desde: Date.now() };
  void fn()
    .catch((e: Error) => console.warn(`[sentinela] ${tipo}: ${e.message}`))
    .finally(() => (estado.sentinelaTrabalho = null));
  return true;
}

export async function coletarAgora() {
  await requireUser();
  const ok = emSegundoPlano("coleta", async () => {
    await coletarSentinela();
    await analisarComIa();
  });
  if (!ok) voltar("/sentinela", "erro", "Já tem um trabalho em andamento.");
  redirect("/sentinela");
}

export async function relatorioAgora() {
  await requireUser();
  const ok = emSegundoPlano("relatório", () => gerarRelatorio());
  if (!ok) voltar("/sentinela", "erro", "Já tem um trabalho em andamento.");
  redirect("/sentinela?aba=plano");
}

export async function adicionarTermo(form: FormData) {
  await requireUser();
  const termos = String(form.get("termo") ?? "")
    .split(/[\n;,]/)
    .map((t) => t.trim().toLowerCase().slice(0, 80))
    .filter((t) => t.length >= 3);
  if (!termos.length) voltar("/sentinela?aba=vigiar", "erro", "Escreva o termo que quer vigiar (ex.: suporte de controle).");
  for (const termo of termos) {
    await db.insert(sentinelaTermos).values({ termo, origem: "usuario" }).onConflictDoUpdate({ target: sentinelaTermos.termo, set: { ativo: true } });
  }
  revalidatePath("/sentinela");
  redirect("/sentinela?aba=vigiar");
}

export async function alternarTermo(id: number, ativo: boolean) {
  await requireUser();
  await db.update(sentinelaTermos).set({ ativo }).where(eq(sentinelaTermos.id, id));
  revalidatePath("/sentinela");
  redirect("/sentinela?aba=vigiar");
}

export async function excluirTermo(id: number) {
  await requireUser();
  await db.delete(sentinelaTermos).where(eq(sentinelaTermos.id, id));
  revalidatePath("/sentinela");
  redirect("/sentinela?aba=vigiar");
}

/** Plano antigo (só texto): separa os itens e acha os modelos 3D de cada um. */
export async function acharModelosDoPlano(relatorioId: number): Promise<{ erro?: string }> {
  await requireUser();
  try {
    await estruturarPlano(relatorioId);
    revalidatePath("/sentinela");
    return {};
  } catch (e) {
    return { erro: (e as Error).message.slice(0, 200) };
  }
}

/** Pesquisa outro termo para um item do plano (o modelo certo nem sempre vem na primeira busca). */
export async function buscarDeNovo(relatorioId: number, indice: number, termo: string): Promise<{ erro?: string }> {
  await requireUser();
  const r = await db.query.sentinelaRelatorios.findFirst({ where: eq(sentinelaRelatorios.id, relatorioId) });
  const item = r?.plano?.[indice];
  if (!r?.plano || !item) return { erro: "Item não encontrado." };
  const busca = termo.trim().slice(0, 80);
  if (busca.length < 2) return { erro: "Digite o que procurar." };
  const modelos = await buscarModelos(busca, 6).catch(() => []);
  const plano = r.plano.map((x, i) => (i === indice ? { ...x, busca, modelos } : x));
  await db.update(sentinelaRelatorios).set({ plano }).where(eq(sentinelaRelatorios.id, relatorioId));
  revalidatePath("/sentinela");
  return modelos.length ? {} : { erro: "Nada encontrado com esse termo. Tente em inglês (ex.: jesus figure shelf)." };
}
