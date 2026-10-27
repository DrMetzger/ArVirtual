import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { contasMarketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { adapter, contaComToken } from "@/lib/marketplaces";

/** Anúncios que já existem na conta do marketplace (tela Marketplaces › Vincular anúncios). */
export async function GET(req: NextRequest) {
  await requireUser();
  const id = Number(req.nextUrl.searchParams.get("conta"));
  const conta = id ? await db.query.contasMarketplace.findFirst({ where: eq(contasMarketplace.id, id) }) : undefined;
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  try {
    const anuncios = await adapter(conta.marketplace).anuncios(await contaComToken(conta));
    return NextResponse.json({ anuncios });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
  }
}
