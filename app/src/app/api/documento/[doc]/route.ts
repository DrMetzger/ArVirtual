import { requireUser } from "@/lib/auth";
import { consultarDocumento } from "@/lib/consultas";

export async function GET(_: Request, { params }: { params: Promise<{ doc: string }> }) {
  await requireUser();
  try {
    const { bruto: _bruto, ...dados } = await consultarDocumento((await params).doc);
    return Response.json(dados);
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 422 });
  }
}
