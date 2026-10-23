import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { gerarComGemini } from "@/lib/gemini";

const Body = z.object({
  mensagens: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1).max(20_000) }))
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ erro: "Mensagem inválida." }, { status: 400 });
  try {
    return Response.json({ texto: await gerarComGemini(parsed.data.mensagens) });
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 502 });
  }
}
