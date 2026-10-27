import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { contasMarketplace, type Marketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { adapter, callbackUrl, sincronizarPedidos } from "@/lib/marketplaces";

export async function GET(req: NextRequest, { params }: { params: Promise<{ mp: string }> }) {
  await requireUser();
  const { mp } = await params;
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const jar = await cookies();
  const esperado = jar.get("arv_oauth")?.value;
  jar.delete("arv_oauth");

  const voltar = (q: string) => NextResponse.redirect(`${base}/marketplaces?${q}`);
  const state = req.nextUrl.searchParams.get("state");
  if (!state || esperado !== `${mp}:${state}`) {
    return voltar(`erro=${encodeURIComponent("Autorização expirada ou inválida. Tente conectar novamente.")}`);
  }

  try {
    const a = adapter(mp);
    const conta = await a.conectar(req.nextUrl.searchParams, callbackUrl(req.nextUrl.origin, mp as Marketplace));
    const valores = {
      nome: conta.nome,
      accessTokenEnc: encrypt(conta.accessToken),
      refreshTokenEnc: encrypt(conta.refreshToken),
      expiraEm: conta.expiraEm,
      dados: conta.dados ?? null,
    };
    const [salva] = await db
      .insert(contasMarketplace)
      .values({ marketplace: a.id, idExterno: conta.idExterno, ...valores })
      .onConflictDoUpdate({ target: [contasMarketplace.marketplace, contasMarketplace.idExterno], set: valores })
      .returning({ id: contasMarketplace.id });
    // Conta nova: importa o histórico de pedidos (2 anos) em segundo plano.
    void sincronizarPedidos({ tipo: "periodo", desde: new Date(Date.now() - 730 * 86400_000), contas: [salva!.id] }).catch(() => undefined);
    return voltar(`ok=${encodeURIComponent(`${a.nome} conectado: ${conta.nome}. Importando o histórico de pedidos em segundo plano.`)}`);
  } catch (e) {
    return voltar(`erro=${encodeURIComponent((e as Error).message)}`);
  }
}
