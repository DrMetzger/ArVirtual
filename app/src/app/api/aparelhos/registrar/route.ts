import { headers } from "next/headers";
import { registrarAparelho, type InfoAparelho } from "@/lib/aparelhos";
import { requireUser } from "@/lib/auth";

/** O app Android manda modelo, bateria e localização ao abrir e a cada poucos minutos. */
export async function POST(req: Request) {
  const user = await requireUser();
  const info = (await req.json().catch(() => null)) as InfoAparelho | null;
  if (!info) return Response.json({ erro: "Dados inválidos." }, { status: 400 });
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
  try {
    return Response.json(await registrarAparelho(info, user, ip));
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 400 });
  }
}
