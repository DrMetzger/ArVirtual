import { requireUser } from "@/lib/auth";
import { consultarCep } from "@/lib/consultas";

export async function GET(_: Request, { params }: { params: Promise<{ cep: string }> }) {
  await requireUser();
  try {
    return Response.json(await consultarCep((await params).cep));
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 404 });
  }
}
