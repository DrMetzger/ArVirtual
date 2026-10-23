import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { contasMarketplace, type Marketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { adapter, callbackUrl } from "@/lib/marketplaces";

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
    await db
      .insert(contasMarketplace)
      .values({ marketplace: a.id, idExterno: conta.idExterno, ...valores })
      .onConflictDoUpdate({ target: [contasMarketplace.marketplace, contasMarketplace.idExterno], set: valores });
    return voltar(`ok=${encodeURIComponent(`${a.nome} conectado: ${conta.nome}`)}`);
  } catch (e) {
    return voltar(`erro=${encodeURIComponent((e as Error).message)}`);
  }
}
