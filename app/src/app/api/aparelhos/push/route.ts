import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { aparelhos } from "@/db/schema";
import { aparelhoBloqueado } from "@/lib/aparelhos";
import { configPushApp } from "@/lib/push";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const logado = async () => Boolean(await verifySession((await cookies()).get(SESSION_COOKIE)?.value));

/** O app pergunta se o push está configurado (dados públicos do Firebase para ele se registrar). */
export async function GET() {
  if (!(await logado())) return Response.json({ semLogin: true }, { status: 401 });
  const cfg = await configPushApp();
  return cfg ? Response.json(cfg) : Response.json({ configurado: false }, { status: 404 });
}

/** O app manda o token de push deste celular (muda de tempos em tempos: o app avisa de novo). */
export async function POST(req: Request) {
  if (!(await logado())) return Response.json({ semLogin: true }, { status: 401 });
  const corpo = (await req.json().catch(() => null)) as { id?: string; token?: string } | null;
  const id = String(corpo?.id ?? "").slice(0, 100);
  const token = String(corpo?.token ?? "").slice(0, 400);
  if (!id || !token) return Response.json({ erro: "Dados inválidos." }, { status: 400 });
  if (await aparelhoBloqueado(id)) return Response.json({ bloqueado: true }, { status: 403 });
  const r = await db.update(aparelhos).set({ pushToken: token }).where(eq(aparelhos.id, id)).returning({ id: aparelhos.id });
  return Response.json({ ok: r.length > 0 });
}
