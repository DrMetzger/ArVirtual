import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { afiliadosProdutos, afiliadosVideos } from "@/db/schema";
import type { VideoLista } from "@/lib/videos-tipos";

const CAMPOS = {
  id: afiliadosVideos.id,
  produtoId: afiliadosVideos.produtoId,
  produto: afiliadosProdutos.nome,
  titulo: afiliadosVideos.titulo,
  urlOrigem: afiliadosVideos.urlOrigem,
  arquivo: afiliadosVideos.arquivo,
  tamanho: afiliadosVideos.tamanho,
  duracaoS: afiliadosVideos.duracaoS,
  status: afiliadosVideos.status,
  erro: afiliadosVideos.erro,
  criadoEm: afiliadosVideos.criadoEm,
};

export async function listarVideos(ids?: number[]): Promise<VideoLista[]> {
  const rows = await db
    .select(CAMPOS)
    .from(afiliadosVideos)
    .leftJoin(afiliadosProdutos, eq(afiliadosProdutos.id, afiliadosVideos.produtoId))
    .where(ids ? inArray(afiliadosVideos.id, ids.length ? ids : [0]) : undefined)
    .orderBy(desc(afiliadosVideos.criadoEm))
    .limit(120);
  return rows.map((r) => ({ ...r, criadoEm: r.criadoEm.toISOString() }));
}

