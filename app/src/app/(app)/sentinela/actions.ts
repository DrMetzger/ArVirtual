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
  voltar("/sentinela", ok ? "ok" : "erro", ok ? "Sentinelas na rua: lendo Shopee e Mercado Livre e analisando com a IA. Leva alguns minutos; quando terminar aparece “Ver resultado” no canto da tela." : "Já tem um trabalho em andamento.");
}

export async function relatorioAgora() {
  await requireUser();
  const ok = emSegundoPlano("relatório", () => gerarRelatorio());
  voltar("/sentinela", ok ? "ok" : "erro", ok ? "A IA está cruzando os dados com o que está em alta na internet. Leva 1 a 2 minutos; quando terminar aparece “Ver resultado” no canto da tela." : "Já tem um trabalho em andamento.");
}

export async function adicionarTermo(form: FormData) {
  await requireUser();
  const termos = String(form.get("termo") ?? "")
    .split(/[\n;,]/)
    .map((t) => t.trim().toLowerCase().slice(0, 80))
    .filter((t) => t.length >= 3);
  if (!termos.length) voltar("/sentinela#termos", "erro", "Escreva o termo que quer vigiar (ex.: suporte de controle).");
  for (const termo of termos) {
    await db.insert(sentinelaTermos).values({ termo, origem: "usuario" }).onConflictDoUpdate({ target: sentinelaTermos.termo, set: { ativo: true } });
  }
  revalidatePath("/sentinela");
  voltar("/sentinela#termos", "ok", `${termos.length} termo(s) na vigília. Entram na próxima coleta.`);
}

export async function alternarTermo(id: number, ativo: boolean) {
  await requireUser();
  await db.update(sentinelaTermos).set({ ativo }).where(eq(sentinelaTermos.id, id));
  revalidatePath("/sentinela");
  redirect("/sentinela#termos");
}

export async function excluirTermo(id: number) {
  await requireUser();
  await db.delete(sentinelaTermos).where(eq(sentinelaTermos.id, id));
  revalidatePath("/sentinela");
  redirect("/sentinela#termos");
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
