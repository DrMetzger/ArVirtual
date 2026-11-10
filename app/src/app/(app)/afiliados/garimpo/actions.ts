"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { garimpoTermos } from "@/db/schema";
import { buscarOfertas, gerarLinkAfiliado, salvarOferta } from "@/lib/afiliados";
import { requireUser } from "@/lib/auth";
import { coletarGarimpo } from "@/lib/garimpo";
import { baixarNaFila, produtoShopee } from "@/lib/afiliados-videos";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";

const voltar = (caminho: string, tipo: "ok" | "erro", msg: string): never => redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}${tipo}=${encodeURIComponent(msg)}`);

const estado = globalThis as unknown as { garimpoDesde?: number | null };
export async function garimpoEmAndamento() {
  const d = estado.garimpoDesde;
  return d && Date.now() - d < 20 * 60_000 ? { desde: d } : null;
}

export async function garimparAgora() {
  await requireUser();
  if (!(await garimpoEmAndamento())) {
    estado.garimpoDesde = Date.now();
    void coletarGarimpo()
      .catch((e: Error) => console.warn(`[garimpo] ${e.message}`))
      .finally(() => (estado.garimpoDesde = null));
  }
  redirect("/afiliados/garimpo");
}

export async function adicionarTermoGarimpo(form: FormData) {
  await requireUser();
  const termos = String(form.get("termo") ?? "")
    .split(/[\n;,]/)
    .map((t) => t.trim().toLowerCase().slice(0, 80))
    .filter((t) => t.length >= 2);
  for (const termo of termos) await db.insert(garimpoTermos).values({ termo }).onConflictDoUpdate({ target: garimpoTermos.termo, set: { ativo: true } });
  revalidatePath("/afiliados/garimpo");
  redirect("/afiliados/garimpo?termos=1");
}

export async function alternarTermoGarimpo(id: number, ativo: boolean) {
  await requireUser();
  await db.update(garimpoTermos).set({ ativo }).where(eq(garimpoTermos.id, id));
  revalidatePath("/afiliados/garimpo");
  redirect("/afiliados/garimpo?termos=1");
}

export async function excluirTermoGarimpo(id: number) {
  await requireUser();
  await db.delete(garimpoTermos).where(eq(garimpoTermos.id, id));
  revalidatePath("/afiliados/garimpo");
  redirect("/afiliados/garimpo?termos=1");
}

/** Pega a oferta atual do produto, gera o link e salva nos seus produtos de afiliado. */
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

/**
 * Baixar o vídeo do anúncio garimpado: confere se o anúncio tem vídeo e baixa na maior qualidade (vai para a galeria).
 * Se você já divulga o produto, o vídeo fica ligado a ele.
 */
export async function baixarVideoGarimpo(itemId: string, lojaId: string, voltarPara: string) {
  await requireUser();
  const endereco = `https://shopee.com.br/product/${lojaId}/${itemId}`;
  let titulo = "";
  try {
    titulo = (await produtoShopee(endereco)).titulo;
  } catch (e) {
    const msg = (e as Error).message;
    voltar(voltarPara, "erro", /no video/i.test(msg) ? "Este anúncio não tem vídeo." : msg);
  }
  const meu = await db.query.afiliadosProdutos.findFirst({ where: eq(afiliadosProdutos.itemId, itemId), columns: { id: true } });
  const [v] = await db
    .insert(afiliadosVideos)
    .values({ produtoId: meu?.id ?? null, titulo, origem: "anuncio", urlOrigem: endereco, status: "baixando" })
    .returning({ id: afiliadosVideos.id });
  baixarNaFila(v!.id, endereco);
  voltar(voltarPara, "ok", `Baixando o vídeo de “${titulo.slice(0, 60)}”. Em instantes ele aparece em Ferramentas › Galeria de vídeos.`);
}
