"use server";

import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import { buscarOfertas, gerarLinkAfiliado, idsDoLink, salvarOferta, sincronizarComissoes, type Oferta } from "@/lib/afiliados";
import { baixarNaFila } from "@/lib/afiliados-videos";
import { requireUser } from "@/lib/auth";
import { PASTA_AFILIADOS } from "@/lib/uploads";

const voltarCom = (caminho: string, tipo: "ok" | "erro", msg: string): never =>
  redirect(`${caminho}${caminho.includes("?") ? "&" : "?"}${tipo}=${encodeURIComponent(msg)}`);

/** Links de produto da Shopee num texto (um por linha, CSV exportado do painel, mensagem...). */
function linksDoTexto(texto: string) {
  const achados = texto.match(/(?:https?:\/\/)?(?:[\w-]+\.)*(?:shopee\.com\.br|shp\.ee)\/[^\s,;"'<>]+/gi) ?? [];
  return [...new Set(achados.map((l) => l.replace(/[).]+$/, "")))].slice(0, 50);
}

/** Cola um ou vários links de produtos da Shopee: busca a oferta de comissão e gera o link de afiliado de cada um. */
export async function adicionarPorLink(form: FormData) {
  await requireUser();
  const links = linksDoTexto(String(form.get("link") ?? ""));
  if (!links.length) voltarCom("/afiliados", "erro", "Cole o link do produto da Shopee (pode colar vários, um por linha).");
  let id = 0;
  let ok = 0;
  const falhas: string[] = [];
  for (const link of links) {
    try {
      const ids = await idsDoLink(link);
      if (!ids) throw new Error("link não reconhecido");
      const { ofertas } = await buscarOfertas({ itemId: ids.itemId, shopId: ids.shopId });
      const o = ofertas.find((x) => x.itemId === ids.itemId);
      if (!o) throw new Error("sem comissão de afiliado no momento");
      id = await salvarOferta(o, "divulgando");
      ok++;
    } catch (e) {
      falhas.push(`${link.slice(0, 60)}: ${(e as Error).message}`);
    }
  }
  revalidatePath("/afiliados");
  if (links.length === 1 && id) redirect(`/afiliados/${id}`);
  if (!ok) voltarCom("/afiliados", "erro", falhas.join(" · "));
  voltarCom("/afiliados", falhas.length ? "erro" : "ok", `${ok} produto(s) adicionado(s).${falhas.length ? ` Não entraram ${falhas.length}: ${falhas.slice(0, 5).join(" · ")}` : ""}`);
}

/** Botão "Adicionar" na busca de produtos (a oferta vem da própria busca). */
export async function adicionarOferta(voltar: string, form: FormData) {
  await requireUser();
  let id = 0;
  let erro = "";
  try {
    const o = JSON.parse(String(form.get("oferta") ?? "")) as Oferta;
    if (!o.itemId || !o.shopId || !o.linkProduto) throw new Error("Oferta inválida.");
    id = await salvarOferta(o);
  } catch (e) {
    erro = (e as Error).message;
  }
  if (erro) voltarCom(voltar, "erro", erro);
  revalidatePath("/afiliados");
  redirect(`/afiliados/${id}`);
}

export async function atualizarProduto(id: number, form: FormData) {
  await requireUser();
  const p = await db.query.afiliadosProdutos.findFirst({ where: eq(afiliadosProdutos.id, id) });
  if (!p) return voltarCom("/afiliados", "erro", "Produto não encontrado.");
  const status = String(form.get("status"));
  const subId = String(form.get("subId") ?? "").replace(/[^\w-]/g, "").slice(0, 50);
  const valores = {
    status: (["ideia", "divulgando", "pausado"].includes(status) ? status : p.status) as typeof p.status,
    observacao: String(form.get("observacao") ?? "").slice(0, 2000),
    subId,
  };
  let erro = "";
  try {
    // Sub ID novo: gera outro link (o sub ID vai dentro dele e aparece no relatório de comissões).
    const link = subId !== p.subId || !p.linkAfiliado ? await gerarLinkAfiliado(p.linkProduto, subId ? [subId] : []) : p.linkAfiliado;
    await db.update(afiliadosProdutos).set({ ...valores, linkAfiliado: link, atualizadoEm: new Date() }).where(eq(afiliadosProdutos.id, id));
  } catch (e) {
    await db.update(afiliadosProdutos).set(valores).where(eq(afiliadosProdutos.id, id));
    erro = `Salvo, mas o link não foi gerado: ${(e as Error).message}`;
  }
  revalidatePath(`/afiliados/${id}`);
  if (erro) voltarCom(`/afiliados/${id}`, "erro", erro);
  voltarCom(`/afiliados/${id}`, "ok", "Salvo.");
}

/** Atualiza preço e comissão do produto pela API (a comissão muda com as campanhas). */
export async function atualizarOferta(id: number) {
  await requireUser();
  const p = await db.query.afiliadosProdutos.findFirst({ where: eq(afiliadosProdutos.id, id) });
  if (!p) return voltarCom("/afiliados", "erro", "Produto não encontrado.");
  let erro = "";
  try {
    const { ofertas } = await buscarOfertas({ itemId: p.itemId, shopId: p.shopId });
    const o = ofertas.find((x) => x.itemId === p.itemId);
    if (!o) erro = "A Shopee não retornou oferta para este produto agora (comissão encerrada?).";
    else await salvarOferta(o);
  } catch (e) {
    erro = (e as Error).message;
  }
  revalidatePath(`/afiliados/${id}`);
  if (erro) voltarCom(`/afiliados/${id}`, "erro", erro);
  voltarCom(`/afiliados/${id}`, "ok", "Preço e comissão atualizados.");
}

export async function excluirProduto(id: number) {
  await requireUser();
  await db.delete(afiliadosProdutos).where(eq(afiliadosProdutos.id, id));
  revalidatePath("/afiliados");
  redirect("/afiliados");
}

const ORIGENS = ["proprio", "anuncio", "criador", "outro"] as const;

/** Baixa um vídeo pelo link (em segundo plano) para a biblioteca do produto. */
export async function baixarVideoDoLink(produtoId: number, form: FormData) {
  await requireUser();
  const url = String(form.get("url") ?? "").trim();
  const origem = String(form.get("origem"));
  const voltar = `/afiliados/${produtoId}`;
  if (!/^https?:\/\/\S+$/.test(url)) return voltarCom(voltar, "erro", "Cole o link completo do vídeo (começando com https://).");
  const [v] = await db
    .insert(afiliadosVideos)
    .values({
      produtoId,
      urlOrigem: url,
      origem: ORIGENS.includes(origem as (typeof ORIGENS)[number]) ? (origem as (typeof ORIGENS)[number]) : "outro",
      autorizacao: String(form.get("autorizacao") ?? "").slice(0, 500),
      status: "baixando",
    })
    .returning({ id: afiliadosVideos.id });
  baixarNaFila(v!.id, url);
  revalidatePath(voltar);
  voltarCom(voltar, "ok", "Baixando o vídeo… ele aparece na lista em alguns instantes (atualize a página).");
}

export async function atualizarVideo(id: number, form: FormData) {
  await requireUser();
  const v = await db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, id) });
  if (!v) return;
  const origem = String(form.get("origem"));
  const status = String(form.get("status"));
  await db
    .update(afiliadosVideos)
    .set({
      titulo: String(form.get("titulo") ?? "").slice(0, 200),
      origem: ORIGENS.includes(origem as (typeof ORIGENS)[number]) ? (origem as (typeof ORIGENS)[number]) : v.origem,
      autorizacao: String(form.get("autorizacao") ?? "").slice(0, 500),
      status: ["bruto", "editado", "postado"].includes(status) && v.status !== "baixando" && v.status !== "erro" ? (status as "bruto") : v.status,
      observacao: String(form.get("observacao") ?? "").slice(0, 1000),
    })
    .where(eq(afiliadosVideos.id, id));
  if (v.produtoId) revalidatePath(`/afiliados/${v.produtoId}`);
}

export async function excluirVideo(id: number) {
  await requireUser();
  const v = await db.query.afiliadosVideos.findFirst({ where: eq(afiliadosVideos.id, id) });
  if (!v) return;
  await db.delete(afiliadosVideos).where(eq(afiliadosVideos.id, id));
  if (v.arquivo) await rm(`${PASTA_AFILIADOS}/${v.arquivo}`, { force: true });
  if (v.produtoId) revalidatePath(`/afiliados/${v.produtoId}`);
}

/** Botão "Sincronizar" das comissões: compras do período (a Shopee guarda os últimos 3 meses). */
export async function sincronizarComissoesAgora(form: FormData) {
  await requireUser();
  const de = new Date(`${form.get("de")}T00:00:00-03:00`);
  const ate = new Date(`${form.get("ate")}T23:59:59-03:00`);
  const desde = Number.isNaN(de.getTime()) ? new Date(Date.now() - 30 * 86400_000) : de;
  let msg: ["ok" | "erro", string];
  try {
    const n = await sincronizarComissoes(desde, Number.isNaN(ate.getTime()) || ate > new Date() ? new Date() : ate);
    msg = ["ok", `${n} item(ns) de pedido atualizados.`];
  } catch (e) {
    msg = ["erro", (e as Error).message];
  }
  revalidatePath("/afiliados");
  revalidatePath("/afiliados/comissoes");
  const voltar = String(form.get("voltar") ?? "");
  voltarCom(voltar.startsWith("/afiliados") ? voltar : `/afiliados/comissoes?de=${form.get("de") ?? ""}&ate=${form.get("ate") ?? ""}`, ...msg);
}
