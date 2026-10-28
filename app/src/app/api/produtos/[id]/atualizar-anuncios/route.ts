import { atualizarAnuncios } from "@/app/(app)/produtos/actions";

// Atualização dos anúncios existentes fora da fila de server actions (mesmo motivo da publicação).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json([{ conta: "-", ok: false, mensagem: "Pedido inválido." }], { status: 400 });
  try {
    return Response.json(await atualizarAnuncios(id, form));
  } catch (e) {
    console.error(`[anúncio] ${(e as Error).message}`);
    return Response.json([{ conta: "-", ok: false, mensagem: `Falha ao atualizar: ${(e as Error).message}` }]);
  }
}
