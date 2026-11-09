"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sentinelaTermos } from "@/db/schema";
import { buscarOfertas, gerarLinkAfiliado, salvarOferta } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { analisarComIa, coletarSentinela, gerarRelatorio } from "@/lib/sentinela";

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

/** Garimpo → afiliados: pega a oferta atual do produto, gera o link e salva como ideia. */
export async function divulgarProduto(itemId: string, shopId: string, voltarPara: string) {
  await requireUser();
  let id = 0;
  try {
    const { ofertas } = await buscarOfertas({ itemId, shopId });
    const o = ofertas.find((x) => x.itemId === itemId);
    if (!o) throw new Error("Este produto não tem comissão de afiliado agora.");
    id = await salvarOferta(o, "divulgando");
  } catch (e) {
    voltar(voltarPara, "erro", (e as Error).message);
  }
  revalidatePath("/afiliados");
  redirect(`/afiliados/${id}`);
}

/** Só o link de afiliado (para copiar e postar na hora). */
export async function linkRapido(link: string, voltarPara: string) {
  await requireUser();
  let curto = "";
  try {
    curto = await gerarLinkAfiliado(link, ["garimpo"]);
  } catch (e) {
    voltar(voltarPara, "erro", (e as Error).message);
  }
  voltar(voltarPara, "ok", `Link de afiliado: ${curto}`);
}
