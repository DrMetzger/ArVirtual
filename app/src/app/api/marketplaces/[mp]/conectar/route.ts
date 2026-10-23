import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { Marketplace } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { adapter, callbackUrl } from "@/lib/marketplaces";
import { sessionCookieOptions } from "@/lib/session";

export async function GET(req: NextRequest, { params }: { params: Promise<{ mp: string }> }) {
  await requireUser();
  const { mp } = await params;
  const base = process.env.APP_URL ?? req.nextUrl.origin;
  const a = adapter(mp);
  if (!(await a.configurado())) {
    const msg = `Cadastre as credenciais do app ${a.nome} em Configurações › Integrações.`;
    return NextResponse.redirect(`${base}/marketplaces?erro=${encodeURIComponent(msg)}`);
  }
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("arv_oauth", `${mp}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieOptions.secure,
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(await a.urlAutorizacao(callbackUrl(req.nextUrl.origin, mp as Marketplace), state));
}
